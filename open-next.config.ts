// @ts-nocheck
// The Cloudflare adapter is installed by .github/workflows/deploy-cloudflare.yml
// at deployment time, so it is intentionally not a Vercel app dependency.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
