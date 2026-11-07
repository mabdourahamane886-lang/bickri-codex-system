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

Create the host directory, generate a long random token, and start the runner container:

```bash
sudo mkdir -p /srv/bcx-sandbox/tmp
sudo chmod 700 /srv/bcx-sandbox/tmp
export BCX_SANDBOX_TOKEN="$(openssl rand -hex 32)"
docker compose -f sandbox/docker-compose.yml up -d --build
```

The compose service binds port 8787 to localhost only and mounts the Docker socket plus a host-shared temporary directory. The socket is effectively root-equivalent: run this service only on a dedicated, patched Linux execution host with no application secrets or unrelated workloads.

Publish localhost:8787 through a Cloudflare Tunnel and protect the hostname with a Cloudflare Access Service Auth policy. Configure these server-only Vercel variables:

- `BCX_SANDBOX_URL=https://runner-bcx.example.com`
- `BCX_SANDBOX_TOKEN=<same random secret>`
- `BCX_SANDBOX_ACCESS_CLIENT_ID=<Cloudflare Access service token ID>`
- `BCX_SANDBOX_ACCESS_CLIENT_SECRET=<Cloudflare Access service token secret>`

The Cloudflare Access variables may be omitted only when another private HTTPS gateway authenticates the BCX backend. Never expose the Docker socket or runner port 8787 directly to the public internet.

### Persistent terminal

- Each authenticated user may hold up to three sessions.
- Sessions persist their container filesystem and working directory for up to 20 minutes of inactivity.
- Commands run inside the same container, with no network access, a read-only root filesystem and bounded memory/CPU/processes. The initial source snapshot is limited to 2 MB.
- The current HTTP terminal is command-oriented (no interactive PTY, shell prompts, or background process attachment). Long-running processes are terminated by the command timeout.
- Session data is ephemeral and is removed on expiry or close. Save project files through the BCX workspace API before closing.

### Flutter / Android builds

The build service accepts a Flutter source tree containing `pubspec.yaml`, then runs `flutter pub get` and `flutter build apk --release` or `flutter build appbundle --release` in a disposable builder container.

- Maximum uploaded source size through the Next.js/Vercel API: 4 MB. Vercel Functions reject request bodies above 4.5 MB; use direct-to-object-storage uploads for larger projects.
- Build timeout: 15 minutes.
- Build concurrency is bounded by runner resources; configure host-level queueing and monitoring for production.
- APK/AAB artifacts are private to the authenticated owner and retained for up to one hour by the runner.
- Android signing is not configured by default. A release artifact built without a configured signing keystore is not a Play Store-ready signed release. Never upload keystore files or passwords into project source. Add a dedicated secret-backed signing workflow before Play Store publication.
- Flutter packages are downloaded during the build. The Flutter builder therefore has outbound network access; enforce host firewall egress rules that block RFC1918/private ranges, link-local addresses and cloud metadata endpoints. Do not rely on Docker bridge networking alone to provide this isolation.

## Vercel Preview deployments

BCX triggers a Vercel Deploy Hook configured for a non-production branch. Create the hook in the Vercel project settings and set:

- `VERCEL_PREVIEW_DEPLOY_HOOK_URL=<preview-only-deploy-hook>`
- `VERCEL_API_TOKEN=<project-scoped-token-with-deployment-read-access>` (for status polling)
- `VERCEL_PROJECT_ID=<linked-project-id>` (for status polling)
- `VERCEL_TEAM_ID=<team-id>` (only when the project belongs to a team)

The API route is `POST /api/deployments/preview`. It requires a signed-in BCX administrator/editor and is rate-limited. It cannot trigger production. A successful HTTP response means Vercel accepted the trigger, not that the build completed successfully. `GET /api/deployments/preview` reads the latest Preview deployments using the optional Vercel API token and project ID; the IDE can show the state and open the Preview URL.

For repository-connected Vercel projects, Git pushes and pull requests can also trigger Preview deployments automatically. Avoid triggering both a hook and a Git integration for the same commit unless duplicate builds are intended.

Production deployment is deliberately not exposed through this endpoint. It requires a separate explicit production approval and a successful Preview verification.

## Operational controls

- Store all tokens and signing material in the deployment platform's secret manager.
- Monitor runner host disk, memory, CPU, container count and build queue.
- Rotate the runner bearer token if it is suspected to be exposed.
- Use a durable queue and object storage before scaling the runner beyond one host; the included in-memory queue/session registry is a single-instance foundation, not a horizontally scalable control plane.
