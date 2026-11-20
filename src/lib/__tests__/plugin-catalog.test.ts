import { describe, expect, it } from "vitest";
import { PLUGIN_CATALOG } from "../plugin-catalog";
import { PLUGIN_LOGOS } from "../plugin-logos";

describe("plugin catalog", () => {
  it("contains exactly 100 distinct services", () => {
    expect(PLUGIN_CATALOG).toHaveLength(100);
    expect(new Set(PLUGIN_CATALOG.map((item) => item.id)).size).toBe(100);
  });

  it("uses a real bundled Simple Icons logo for every service", () => {
    expect(new Set(PLUGIN_CATALOG.map((item) => item.icon)).size).toBe(100);
    for (const item of PLUGIN_CATALOG) {
      expect(PLUGIN_LOGOS.has(item.icon), `${item.name} (${item.icon})`).toBe(true);
    }
  });
});
