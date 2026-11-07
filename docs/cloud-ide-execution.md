# BCX cloud execution, Flutter builds and deployments

## Runner architecture

The Next.js/Vercel application never executes arbitrary project code itself. It authenticates the user, enforces quotas and proxies to the separately hosted sandbox service.

### Build and run the sandbox images

From the repository root on a dedicated Linux Docker host:

```bash
docker build -t bcx-runner-python:latest -f sandbox/images/python.Dockerfile .
docker build -t bcx-runner-node:latest -f sandbox/images/node.Dockerfile .
docker build -t bcx-runner-workspace:latest -f sandbox/images/workspace.Dockerfile .
docker build -t bcx-flutter-builder:stable -f sandbox/images/flutter-builder.Dockerfile .
```

The Flutter builder is a large image and requires enough disk space and RAM. The host should have at least 8 GB RAM available for concurrent Flutter builds, plus Docker storage for the Android SDK and Gradle caches.

### Start the runner

```bash
export BCX_SANDBOX_TOKEN="$(openssl rand -hex 32)"
PORT=8787 node sandbox/runner.mjs
```

Keep the Docker host isolated, patched and behind HTTPS. Firewall the runner so only the BCX web backend can access it. Do not expose the Docker socket or runner port to the public internet.

Configure these server-only Vercel variables:

- `BCX_SANDBOX_URL=https://runner.example.internal` (base URL; the service exposes /execute, /terminal/* and /build/flutter/*)
- `BCX_SANDBOX_TOKEN=<same random secret>`

### Persistent terminal

- Each authenticated user may hold up to three sessions.
- Sessions persist their container filesystem and working directory for up to 20 minutes of inactivity.
- Commands run inside the same container, with no network access, a read-only root filesystem and bounded memory/CPU/processes.
- The current HTTP terminal is command-oriented (no interactive PTY, shell prompts, or background process attachment). Long-running processes are terminated by the command timeout.
- Session data is ephemeral and is removed on expiry or close. Save project files through the BCX workspace API before closing.

### Flutter / Android builds

The build service accepts a Flutter source tree containing `pubspec.yaml`, then runs `flutter pub get` and `flutter build apk --release` or `flutter build appbundle --release` in a disposable builder container.

- Maximum uploaded source size: 8 MB.
- Build timeout: 15 minutes.
- Build concurrency is bounded by runner resources; configure host-level queueing and monitoring for production.
- APK/AAB artifacts are private to the authenticated owner and retained for up to one hour by the runner.
- Android signing is not configured by default. A release artifact built without a configured signing keystore is not a Play Store-ready signed release. Never upload keystore files or passwords into project source. Add a dedicated secret-backed signing workflow before Play Store publication.
- Flutter packages are downloaded during the build. The Flutter builder therefore has outbound network access; keep it isolated from internal networks and host metadata services.

## Vercel Preview deployments

BCX triggers a Vercel Deploy Hook configured for a non-production branch. Create the hook in the Vercel project settings and set:

- `VERCEL_PREVIEW_DEPLOY_HOOK_URL=<preview-only-deploy-hook>`

The API route is `POST /api/deployments/preview`. It requires a signed-in BCX administrator/editor and is rate-limited. It cannot trigger production. A successful HTTP response means Vercel accepted the trigger, not that the build completed successfully. Follow the deployment in the Vercel dashboard or through the Vercel deployment integration.

For repository-connected Vercel projects, Git pushes and pull requests can also trigger Preview deployments automatically. Avoid triggering both a hook and a Git integration for the same commit unless duplicate builds are intended.

Production deployment is deliberately not exposed through this endpoint. It requires a separate explicit production approval and a successful Preview verification.

## Operational controls

- Store all tokens and signing material in the deployment platform's secret manager.
- Monitor runner host disk, memory, CPU, container count and build queue.
- Rotate the runner bearer token if it is suspected to be exposed.
- Use a durable queue and object storage before scaling the runner beyond one host; the included in-memory queue/session registry is a single-instance foundation, not a horizontally scalable control plane.
