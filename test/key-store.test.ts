import { describe, expect, it } from "vitest";
import { KeyStore, checkKeyFormat, describeKey } from "../src/security/key-store";

const KEY = "sk-ant-api03-abcdefghijklmnop-WXYZ";

describe("checkKeyFormat", () => {
  it("accepts a key-shaped string, ignoring surrounding whitespace", () => {
    expect(checkKeyFormat(`  ${KEY}\n`)).toEqual({ ok: true });
  });
  it.each([
    ["", "Paste your API key first."],
    ["sk-ant-abc def", "The key contains spaces or line breaks. Paste just the key."],
    ["sk-proj-123", "Anthropic API keys start with sk-ant-."],
  ])("rejects %j", (input, reason) => {
    expect(checkKeyFormat(input)).toEqual({ ok: false, reason });
  });
});

describe("KeyStore", () => {
  it("stores a valid key trimmed, and describes it by its last four characters only", () => {
    const store = new KeyStore();
    expect(store.set(` ${KEY} `)).toEqual({ ok: true });
    expect(store.get()).toBe(KEY);
    expect(store.describe()).toBe("sk-ant-…WXYZ");
    expect(describeKey(KEY)).not.toContain("abcdefgh");
  });

  it("keeps the previous key when a bad one is entered", () => {
    const store = new KeyStore();
    store.set(KEY);
    store.set("nope");
    expect(store.get()).toBe(KEY);
  });

  it("does not leak the key through JSON, spreading, or string conversion", () => {
    const store = new KeyStore();
    store.set(KEY);
    expect(JSON.stringify({ store })).not.toContain(KEY);
    expect(JSON.stringify({ ...store })).not.toContain(KEY);
    expect(String(store)).not.toContain(KEY);
    expect(Object.keys(store)).toEqual([]);
  });

  it("forgets the key on clear", () => {
    const store = new KeyStore();
    store.set(KEY);
    store.clear();
    expect(store.has()).toBe(false);
    expect(store.describe()).toBeNull();
    expect(() => store.get()).toThrow("No API key set.");
  });
});
