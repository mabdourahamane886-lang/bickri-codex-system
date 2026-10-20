import { deploymentsPlugin } from "./deployments";
import { githubPlugin } from "./github";
import { drivePlugin } from "./google-drive";
import { notionPlugin } from "./notion";
import { registryPlugin } from "./registry";
import { socialPlugin } from "./social";
import { webPlugin } from "./web";
import type { Plugin } from "../types";

/** Catalogue des plugins. Les outils sociaux ne renvoient que des résultats publics indexés. */
export const PLUGINS: Plugin[] = [githubPlugin, deploymentsPlugin, registryPlugin, webPlugin, socialPlugin, drivePlugin, notionPlugin];
