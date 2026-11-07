import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.BCX_SANDBOX_TOKEN;
const MAX_CODE = 30_000, MAX_OUTPUT = 64 * 1024, MAX_BODY = 8 * 1024 * 1024;
const SESSION_TTL_MS = 20 * 60_000, BUILD_TTL_MS = 60 * 60_000;
const MAX_SESSIONS_PER_USER = 3, MAX_SESSIONS = 500, MAX_BUILDS = 50;
const buckets = new Map(), sessions = new Map(), builds = new Map();
if (!TOKEN || TOKEN.length < 32) throw new Error("BCX_SANDBOX_TOKEN must be at least 32 characters.");

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function limited(key, max = 8) {
  const now = Date.now();
  let item = buckets.get(key);
  if (!item || now - item.start > 60_000) {
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > 60_000) buckets.delete(k);
    item = { start: now, count: 0 };
  }
  item.count++; buckets.set(key, item); return item.count <= max;
}
async function readJson(req, maxBytes = MAX_BODY) {
  let raw = "", bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error("Request too large"), { status: 413 });
    raw += chunk.toString("utf8");
  }
  try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}
function safeOwner(v) { return typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v) ? v : null; }
function safeFilePath(v) {
  if (typeof v !== "string" || !v || v.length > 240 || v.includes("\\") || v.startsWith("/")) return null;
  const p = path.posix.normalize(v);
  if (p === "." || p === ".." || p.startsWith("../") || p.includes("/../") || p.split("/").some((x) => !x || x === "." || x === "..")) return null;
  return p;
}
function validateFiles(files, maxTotal) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 300) return false;
  let total = 0;
  for (const f of files) {
    if (!f || typeof f !== "object" || !safeFilePath(f.path ?? f.name) || typeof f.content !== "string" || f.content.length > 500_000) return false;
    total += Buffer.byteLength(f.content, "utf8");
    if (total > maxTotal) return false;
  }
  return true;
}
async function writeFiles(dir, files) {
  for (const f of files) {
    const rel = safeFilePath(f.path ?? f.name);
    if (!rel) throw new Error("Invalid workspace file path");
    const dest = path.join(dir, rel);
    await mkdir(path.dirname(dest), { recursive: true, mode: 0o777 });
    await chmod(path.dirname(dest), 0o777);
    await writeFile(dest, f.content, { mode: 0o666 });
    await chmod(dest, 0o666);
  }
}
function collect(target, chunk) {
  const next = target + chunk.toString("utf8");
  return next.length > MAX_OUTPUT ? next.slice(0, MAX_OUTPUT) + "\n[output truncated]" : next;
}
function runDocker(args, timeoutMs, stdin = "") {
  return new Promise((resolve) => {
    const started = Date.now(), child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "", timedOut = false, settled = false;
    child.stdout.on("data", (c) => { stdout = collect(stdout, c); });
    child.stderr.on("data", (c) => { stderr = collect(stderr, c); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 1000).unref(); }, timeoutMs);
    child.on("error", (e) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr: e.message, exitCode: -1, timedOut, durationMs: Date.now() - started }); });
    child.on("close", (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? -1, timedOut, durationMs: Date.now() - started }); });
    child.stdin.on("error", () => {}); child.stdin.end(stdin);
  });
}
function getSession(ownerId, id) { const s = sessions.get(id); return s && s.ownerId === ownerId ? s : null; }
async function closeSession(id) {
  const s = sessions.get(id); if (!s) return; sessions.delete(id);
  await new Promise((resolve) => { const p = spawn("docker", ["rm", "-f", s.containerName], { stdio: "ignore" }); p.on("error", resolve); p.on("close", resolve); });
  await rm(s.dir, { recursive: true, force: true }).catch(() => {});
}
async function openTerminal(body) {
  const ownerId = safeOwner(body.ownerId), files = body.files ?? [{ path: "README.md", content: "# BCX workspace\n" }];
  if (!ownerId || !validateFiles(files, 2_000_000)) throw Object.assign(new Error("Invalid owner or workspace files"), { status: 400 });
  if ([...sessions.values()].filter((s) => s.ownerId === ownerId).length >= MAX_SESSIONS_PER_USER || sessions.size >= MAX_SESSIONS)
    throw Object.assign(new Error("Terminal session quota reached"), { status: 429 });
  const sessionId = randomUUID(), dir = await mkdtemp(path.join(tmpdir(), "bcx-terminal-"));
  const containerName = "bcx-term-" + randomUUID().replaceAll("-", "").slice(0, 18);
  try {
    await writeFiles(dir, files); await chmod(dir, 0o777);
    const started = await runDocker([
      "run", "-d", "--name", containerName, "--network=none", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--pids-limit=128",
      "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
      "--mount", "type=bind,src=" + dir + ",dst=/workspace", "--workdir=/workspace", "--env", "HOME=/tmp", "--env", "TMPDIR=/tmp",
      "bcx-runner-workspace:latest", "sleep", "infinity"
    ], 15_000);
    if (started.exitCode !== 0) throw new Error(started.stderr || started.stdout || "Unable to start terminal container");
    sessions.set(sessionId, { ownerId, dir, containerName, cwd: "/workspace", createdAt: Date.now(), lastUsedAt: Date.now() });
    return { sessionId, status: "running", expiresInSeconds: SESSION_TTL_MS / 1000 };
  } catch (e) { await rm(dir, { recursive: true, force: true }).catch(() => {}); throw e; }
}
async function terminalCommand(body) {
  const ownerId = safeOwner(body.ownerId), id = typeof body.sessionId === "string" ? body.sessionId : "";
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!ownerId || !id || !command || command.length > 4000) throw Object.assign(new Error("Invalid terminal command"), { status: 400 });
  const s = getSession(ownerId, id);
  if (!s) throw Object.assign(new Error("Terminal session not found or expired"), { status: 404 });
  if (Date.now() - s.lastUsedAt > SESSION_TTL_MS) { await closeSession(id); throw Object.assign(new Error("Terminal session expired"), { status: 410 }); }
  s.lastUsedAt = Date.now();
  const cd = command.match(/^cd(?:\s+(.+))?$/);
  if (cd) {
    const requested = (cd[1] || "/workspace").replace(/^["']|["']$/g, "");
    const resolved = path.posix.resolve(s.cwd, requested);
    if (resolved !== "/workspace" && !resolved.startsWith("/workspace/")) throw Object.assign(new Error("Working directory must stay inside /workspace"), { status: 400 });
    const check = await runDocker(["exec", s.containerName, "test", "-d", resolved], 5000);
    if (check.exitCode !== 0) return { stdout: "", stderr: "Directory not found: " + requested, exitCode: 1, cwd: s.cwd };
    s.cwd = resolved; return { stdout: "", stderr: "", exitCode: 0, cwd: s.cwd };
  }
  const timeout = Number.isInteger(body.timeoutMs) ? Math.min(Math.max(body.timeoutMs, 1000), 30_000) : 15_000;
  const innerSeconds = Math.max(1, Math.floor(timeout / 1000) - 2);
  const result = await runDocker(["exec", "--workdir", s.cwd, s.containerName, "timeout", "--signal=TERM", "--kill-after=2s", innerSeconds + "s", "/bin/sh", "-lc", command], timeout + 3000);
  s.lastUsedAt = Date.now();
  return { ...result, timedOut: result.timedOut || result.exitCode === 124, cwd: s.cwd };
}
async function startFlutterBuild(body) {
  const ownerId = safeOwner(body.ownerId), files = body.files, target = body.target === "aab" ? "appbundle" : "apk";
  if (!ownerId || !validateFiles(files, 8_000_000) || !files.some((f) => (f.path ?? f.name) === "pubspec.yaml"))
    throw Object.assign(new Error("A Flutter project with pubspec.yaml is required"), { status: 400 });
  if ([...builds.values()].filter((job) => job.status === "queued" || job.status === "building").length >= 1) throw Object.assign(new Error("One Flutter build is already running. Wait for it to finish."), { status: 429 });
  if (builds.size >= MAX_BUILDS) {
    for (const [id, job] of builds) if (job.finishedAt && Date.now() - job.finishedAt > BUILD_TTL_MS) builds.delete(id);
    if (builds.size >= MAX_BUILDS) throw Object.assign(new Error("Build queue is full"), { status: 429 });
  }
  const buildId = randomUUID(), dir = await mkdtemp(path.join(tmpdir(), "bcx-flutter-"));
  await writeFiles(dir, files);
  const job = { buildId, ownerId, dir, target, status: "queued", createdAt: Date.now(), startedAt: null, finishedAt: null, output: "", error: null, artifactPath: null, artifactName: null, artifactSize: null };
  builds.set(buildId, job);
  void (async () => {
    job.status = "building"; job.startedAt = Date.now();
    const args = [
      "run", "--rm", "--name", "bcx-flutter-" + buildId.slice(0, 12), "--network=bridge", "--memory=5g", "--memory-swap=5g",
      "--cpus=2.5", "--pids-limit=512", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--mount", "type=bind,src=" + dir + ",dst=/workspace", "--workdir=/workspace", "--tmpfs", "/tmp:rw,size=1g",
      "bcx-flutter-builder:stable", "/bin/sh", "-lc", "if [ ! -d android ]; then flutter create --platforms=android --project-name bcx_app --org com.bickri /tmp/bcx_android_scaffold && cp -a /tmp/bcx_android_scaffold/android ./android; fi && flutter pub get && flutter build " + target + " --release"
    ];
    const result = await runDocker(args, 15 * 60_000);
    job.output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-MAX_OUTPUT);
    if (result.exitCode === 0) {
      const relative = target === "apk" ? "build/app/outputs/flutter-apk/app-release.apk" : "build/app/outputs/bundle/release/app-release.aab";
      const artifactPath = path.join(dir, relative);
      try {
        const info = await stat(artifactPath); job.artifactPath = artifactPath;
        job.artifactName = target === "apk" ? "app-release.apk" : "app-release.aab";
        job.artifactSize = info.size; job.status = "ready";
      } catch { job.status = "error"; job.error = "Build completed but the expected artifact was not found."; }
    } else { job.status = result.timedOut ? "timeout" : "error"; job.error = result.timedOut ? "Flutter build exceeded the 15-minute limit." : "Flutter build failed."; }
    job.finishedAt = Date.now();
  })().catch((e) => { job.status = "error"; job.error = e instanceof Error ? e.message : "Build worker failed."; job.finishedAt = Date.now(); });
  return { buildId, status: "queued", target, pollAfterMs: 3000 };
}
function publicBuild(job) {
  return { buildId: job.buildId, status: job.status, target: job.target, output: job.output, error: job.error, artifactName: job.artifactName, artifactSize: job.artifactSize, durationMs: job.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : null };
}
function findBuild(ownerId, id) { const job = builds.get(id); return job && job.ownerId === ownerId ? job : null; }

const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== "Bearer " + TOKEN) return send(res, 401, { error: "Unauthorized" });
  if (!limited(req.socket.remoteAddress || "unknown", 300)) return send(res, 429, { error: "Rate limit exceeded" });
  try {
    if (req.method === "POST" && req.url === "/execute") {
      const body = await readJson(req, 50_000), language = String(body.language || ""), code = typeof body.code === "string" ? body.code : "";
      if (!["python", "javascript", "typescript"].includes(language)) return send(res, 400, { error: "Unsupported language" });
      if (!code.trim() || code.length > MAX_CODE) return send(res, 400, { error: "Code is empty or too large" });
      const dir = await mkdtemp(path.join(tmpdir(), "bcx-run-"));
      try {
        const filename = language === "python" ? "main.py" : language === "typescript" ? "main.ts" : "main.js";
        await chmod(dir, 0o755); await writeFile(path.join(dir, filename), code, { mode: 0o444 });
        const image = language === "python" ? "bcx-runner-python:latest" : "bcx-runner-node:latest";
        const command = language === "python" ? ["python", "/workspace/main.py"] : language === "typescript" ? ["node", "--experimental-strip-types", "/workspace/main.ts"] : ["node", "/workspace/main.js"];
        const name = "bcx-" + process.pid + "-" + randomUUID().slice(0, 12);
        const args = ["run", "--rm", "--name", name, "--network=none", "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=64",
          "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
          "--mount", "type=bind,src=" + dir + ",dst=/workspace,readonly", "--workdir=/workspace", "--env", "HOME=/tmp", "--env", "TMPDIR=/tmp",
          "--env", "PYTHONDONTWRITEBYTECODE=1", image, ...command];
        return send(res, 200, await runDocker(args, 5500, typeof body.stdin === "string" ? body.stdin.slice(0, 5000) : ""));
      } finally { await rm(dir, { recursive: true, force: true }); }
    }
    if (req.method === "POST" && req.url === "/terminal/open") return send(res, 201, await openTerminal(await readJson(req)));
    if (req.method === "POST" && req.url === "/terminal/command") return send(res, 200, await terminalCommand(await readJson(req, 16_000)));
    if (req.method === "POST" && req.url === "/terminal/touch") {
      const body = await readJson(req, 4000), ownerId = safeOwner(body.ownerId), id = typeof body.sessionId === "string" ? body.sessionId : "";
      const session = getSession(ownerId, id);
      if (!session) return send(res, 404, { error: "Session not found" });
      session.lastUsedAt = Date.now();
      return send(res, 200, { alive: true, expiresInSeconds: SESSION_TTL_MS / 1000 });
    }

    if (req.method === "DELETE" && req.url === "/terminal/session") {
      const body = await readJson(req, 4000), ownerId = safeOwner(body.ownerId), id = typeof body.sessionId === "string" ? body.sessionId : "";
      if (!getSession(ownerId, id)) return send(res, 404, { error: "Session not found" });
      await closeSession(id); return send(res, 200, { closed: true });
    }
    if (req.method === "POST" && req.url === "/build/flutter") return send(res, 202, await startFlutterBuild(await readJson(req)));
    const status = req.method === "GET" && req.url.match(/^\/build\/flutter\/([a-f0-9-]+)$/i);
    if (status) {
      const job = findBuild(safeOwner(req.headers["x-bcx-owner"]), status[1]);
      if (!job) return send(res, 404, { error: "Build not found" });
      return send(res, 200, publicBuild(job));
    }
    const artifact = req.method === "GET" && req.url.match(/^\/build\/flutter\/([a-f0-9-]+)\/artifact$/i);
    if (artifact) {
      const job = findBuild(safeOwner(req.headers["x-bcx-owner"]), artifact[1]);
      if (!job || job.status !== "ready" || !job.artifactPath) return send(res, 404, { error: "Build artifact not available" });
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": job.artifactSize, "content-disposition": "attachment; filename=\"" + job.artifactName + "\"", "cache-control": "no-store" });
      return createReadStream(job.artifactPath).pipe(res);
    }
    return send(res, 404, { error: "Not found" });
  } catch (e) {
    const status = Number(e?.status) || 500;
    return send(res, status, { error: status === 500 ? "Sandbox operation failed" : e.message });
  }
});
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastUsedAt > SESSION_TTL_MS) void closeSession(id);
  for (const [id, job] of builds) if (job.finishedAt && now - job.finishedAt > BUILD_TTL_MS) {
    builds.delete(id); void rm(job.dir, { recursive: true, force: true }).catch(() => {});
  }
}, 60_000).unref();
server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
server.listen(PORT, "0.0.0.0", () => process.stdout.write("BCX sandbox service listening on " + PORT + "\n"));
