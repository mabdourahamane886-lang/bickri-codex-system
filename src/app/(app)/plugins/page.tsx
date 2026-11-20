import { PLUGIN_CATALOG } from "@/lib/plugin-catalog";
import { PLUGIN_LOGOS } from "@/lib/plugin-logos";
import { PluginCatalogClient } from "./PluginCatalogClient";

export default function PluginsPage() {
  const items = PLUGIN_CATALOG.map((item) => {
    const icon = PLUGIN_LOGOS.get(item.icon);
    if (!icon) throw new Error(`Logo Simple Icons introuvable pour ${item.name} (${item.icon}).`);
    return { ...item, iconPath: icon.path, iconColor: icon.hex };
  });

  return <PluginCatalogClient items={items}/>;
}
