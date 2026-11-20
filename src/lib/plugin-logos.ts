import logoData from "./plugin-logos.json";

type PluginLogo = { title: string; hex: string; path: string };

export const PLUGIN_LOGOS: ReadonlyMap<string, PluginLogo> = new Map(Object.entries(logoData));
