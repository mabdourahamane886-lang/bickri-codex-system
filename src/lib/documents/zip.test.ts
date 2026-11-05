import { describe, expect, it } from "vitest";
import { makeZip, readZip } from "./zip";

describe("ZIP helpers", () => {
  it("round-trips UTF-8 files through deflate", () => {
    const archive = makeZip([
      { name: "word/document.xml", data: "<document>Bonjour Niger</document>" },
      { name: "meta.txt", data: "Mémoire Bickri" },
    ]);
    const files = readZip(archive);
    expect(files.get("word/document.xml")?.toString("utf8")).toBe("<document>Bonjour Niger</document>");
    expect(files.get("meta.txt")?.toString("utf8")).toBe("Mémoire Bickri");
  });
  it("rejects invalid archives", () => {
    expect(() => readZip(Buffer.from("not a zip"))).toThrow("Archive ZIP invalide");
  });
});
