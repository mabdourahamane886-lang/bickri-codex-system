import { deploymentsPlugin } from "./deployments";
import { githubPlugin } from "./github";
import { registryPlugin } from "./registry";
import { webPlugin } from "./web";
import type { Plugin } from "../types";

/** Catalogue des plugins. Pour en ajouter un : créer un fichier ici et l'ajouter à cette liste. */
export const PLUGINS: Plugin[] = [githubPlugin, deploymentsPlugin, registryPlugin, webPlugin];
