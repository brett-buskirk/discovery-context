// Holds the visitor's API key in memory, and nowhere else. It is never written to storage, the URL,
// the DOM, or logs, and it's gone when the tab closes or reloads. See CLAUDE.md, "Key-handling rules".

export type KeyCheck = { ok: true } | { ok: false; reason: string };

/** A light format check so an obvious paste mistake is caught before the first request. */
export function checkKeyFormat(raw: string): KeyCheck {
  const key = raw.trim();
  if (key === "") return { ok: false, reason: "Paste your API key first." };
  if (/\s/.test(key)) return { ok: false, reason: "The key contains spaces or line breaks. Paste just the key." };
  if (!key.startsWith("sk-ant-")) return { ok: false, reason: "Anthropic API keys start with sk-ant-." };
  return { ok: true };
}

/** For display: enough to recognise which key is loaded, not enough to use it. */
export function describeKey(key: string): string {
  return `sk-ant-…${key.slice(-4)}`;
}

export class KeyStore {
  // A private field rather than a property, so the key doesn't show up when the object is logged,
  // serialised, or spread.
  #key: string | null = null;

  set(raw: string): KeyCheck {
    const check = checkKeyFormat(raw);
    if (check.ok) this.#key = raw.trim();
    return check;
  }

  has(): boolean {
    return this.#key !== null;
  }

  /** Only the API client should call this. */
  get(): string {
    if (this.#key === null) throw new Error("No API key set.");
    return this.#key;
  }

  describe(): string | null {
    return this.#key === null ? null : describeKey(this.#key);
  }

  clear(): void {
    this.#key = null;
  }

  toJSON(): string {
    return "[KeyStore]";
  }
}
