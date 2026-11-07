# BCX isolated code runner

This runner is a separate Linux service. It must **not** be deployed inside the Next.js/Vercel process. Host it on a dedicated, patched Linux machine or isolated container host with Docker installed. Restrict inbound network access to the BCX web backend/private network.

## Build the execution images

From the repository root:

```bash
docker build -t bcx-runner-python:latest -f sandbox/images/python.Dockerfile .
docker build -t bcx-runner-node:latest -f sandbox/images/node.Dockerfile .
docker build -t bcx-runner-workspace:latest -f sandbox/images/workspace.Dockerfile .
docker build -t bcx-flutter-builder:stable -f sandbox/images/flutter-builder.Dockerfile .
```

The runner uses Python 3.12, Node 22 and Node's built-in TypeScript stripping. It supports Python, JavaScript and TypeScript.

## Start the runner

Use a random secret of at least 32 characters and keep it private:

```bash
export BCX_SANDBOX_TOKEN="$(openssl rand -hex 32)"
PORT=8787 node sandbox/runner.mjs
```

Place it behind HTTPS and firewall it so only the BCX backend can reach it. The runner needs access to the Docker daemon; therefore it belongs on a dedicated execution host, not on the same machine that stores application secrets. Never expose the Docker socket to the public internet.

Configure these **server-only** Vercel environment variables:

- `BCX_SANDBOX_URL=https://runner.example.internal/execute`
- `BCX_SANDBOX_TOKEN=<same random secret>`

The Next.js route `POST /api/ai/execute` validates the logged-in user and allowed languages before proxying the request.

## Isolation controls

Every execution starts a fresh disposable container with:
- network disabled (`--network=none`);
- 128 MiB memory and 0.5 CPU;
- 64 process limit and a 5.5-second timeout;
- read-only root filesystem and read-only source mount;
- temporary filesystem limited to 16 MiB;
- all Linux capabilities dropped and no-new-privileges enabled;
- non-root container user;
- container removal after execution.

This is a baseline isolation profile, not a guarantee against every container escape. Keep the host kernel and Docker patched, isolate the runner host, monitor resource use, and never mount sensitive host paths into execution containers.


## Additional BCX Cloud IDE services

The same runner service also exposes owner-scoped persistent terminal containers and asynchronous Flutter APK/AAB builds. See [`docs/cloud-ide-execution.md`](../docs/cloud-ide-execution.md) for build images, limits, deployment-hook configuration and operational security requirements.
