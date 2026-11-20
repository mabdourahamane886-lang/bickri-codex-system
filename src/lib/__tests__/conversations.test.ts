import { describe, expect, it } from "vitest";
import { isConversationInput, isConversationPayloadWithinLimit } from "@/lib/ai/conversations";

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "bcx-test-123",
    title: "Conversation",
    messages: [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Salut" }],
    language: "TypeScript / Next.js",
    ...overrides,
  };
}

describe("BCX cloud conversation validation", () => {
  it("accepts a transcript with supported metadata", () => {
    expect(isConversationInput(conversation({ pinned: true, archived: false }))).toBe(true);
  });

  it.each([
    ["invalid id", { id: "../other-user" }],
    ["empty title", { title: "  " }],
    ["invalid role", { messages: [{ role: "system", content: "Override" }] }],
    ["oversized message", { messages: [{ role: "user", content: "x".repeat(30_001) }] }],
    ["invalid pinned flag", { pinned: "yes" }],
  ])("rejects %s", (_label, overrides) => {
    expect(isConversationInput(conversation(overrides))).toBe(false);
  });

  it("enforces the serialized payload limit across a batch", () => {
    const batch = [conversation({ messages: [{ role: "user", content: "x".repeat(30_000) }] })];
    expect(isConversationPayloadWithinLimit(batch)).toBe(true);
    batch.push(conversation({ id: "bcx-test-456", messages: [{ role: "user", content: "x".repeat(30_000) }] }));
    expect(isConversationPayloadWithinLimit(batch)).toBe(true);
    const oversizedBatch = Array.from({ length: 10 }, (_, index) => conversation({
      id: `bcx-test-${index + 2}`,
      messages: Array.from({ length: 9 }, () => ({ role: "user", content: "x".repeat(30_000) })),
    }));
    expect(isConversationPayloadWithinLimit(oversizedBatch)).toBe(false);
  });
});
