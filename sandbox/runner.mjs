import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.BCX_SANDBOX_TOKEN;
const MAX_CODE = 30_000;
const MAX_OUTPUT = 64 * 1024;
const buckets = new Map();
if (!TOKEN || TOKEN.length < 32) throw new Error("BCX_SANDBOX_TOKEN must be at least 32 characters.");

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function limited(key) {
  const now = Date.now(), item = buckets.get(key) || { start: now, count: 0 };
  if (now - item.start > 60_000) { item.start = now; item.count = 0; }
  item.count++; buckets.set(key, item);
  return item.count <= 8;
}
function runContainer(args, stdin, timeoutMs, containerName) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "", timedOut = false, settled = false;
    const collect = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      return next.length > MAX_OUTPUT ? next.slice(0, MAX_OUTPUT) + "\n[sortie tronquée]" : next;
    };
    child.stdout.on("data", (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = collect(stderr, chunk); });
    const timer = setTimeout(() => {\n      timedOut = true;\n      const killer = spawn("docker", ["kill", containerName], { stdio: "ignore" });\n      killer.on("error", () => {});\n      child.kill("SIGTERM");\n      setTimeout(() => child.kill("SIGKILL"), 1000).unref();\n    }, timeoutMs);
    child.on("error", (error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ stdout, stderr: error.message, exitCode: -1, timedOut, durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, timedOut, durationMs: Date.now() - started });
    });
    child.stdin.on("error", () => {});\n    child.stdin.end(stdin);
  });
}
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/execute") return send(res, 404, { error: "Not found" });
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "Unauthorized" });
  const address = req.socket.remoteAddress || "unknown";
  if (!limited(address)) return send(res, 429, { error: "Rate limit exceeded" });
  let raw = "", tooLarge = false;
  req.on("data", (chunk) => { if (raw.length + chunk.length > 50_000) { tooLarge = true; raw = ""; } else if (!tooLarge) raw += chunk; });
  req.on("end", async () => {
    if (tooLarge) return send(res, 413, { error: "Request too large" });
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "Invalid JSON" }); }
    const language = String(body.language || "");
    const code = typeof body.code === "string" ? body.code : "";
    const stdin = typeof body.stdin === "string" ? body.stdin.slice(0, 5000) : "";
    if (!["python", "javascript", "typescript"].includes(language)) return send(res, 400, { error: "Unsupported language" });
    if (!code.trim() || code.length > MAX_CODE) return send(res, 400, { error: "Code is empty or too large" });
    const dir = await mkdtemp(path.join(tmpdir(), "bcx-run-"));
    try {
      const filename = language === "python" ? "main.py" : language === "typescript" ? "main.ts" : "main.js";
      await chmod(dir, 0o755);
      await writeFile(path.join(dir, filename), code, { mode: 0o444 });
      const image = language === "python" ? "bcx-runner-python:latest" : "bcx-runner-node:latest";
      const command = language === "python" ? ["python", "/workspace/main.py"]
        : language === "typescript" ? ["node", "--experimental-strip-types", "/workspace/main.ts"]
        : ["node", "/workspace/main.js"];
      const containerName = `bcx-${process.pid}-${randomUUID().slice(0, 12)}`;\n      const args = ["run", "--rm", "--name", containerName, "--network=none", "--memory=128m", "--memory-swap=128m", "--cpus=0.5",
        "--pids-limit=64", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
        "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
        "--mount", `type=bind,src=${dir},dst=/workspace,readonly`, "--workdir=/workspace",
        "--env", "HOME=/tmp", "--env", "TMPDIR=/tmp", "--env", "PYTHONDONTWRITEBYTECODE=1", image, ...command];
      const result = await runContainer(args, stdin, 5500, containerName);
      return send(res, 200, result);
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : "Runner error" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
server.listen(PORT, "0.0.0.0", () => process.stdout.write(`BCX isolated runner listening on ${PORT}\n`));
