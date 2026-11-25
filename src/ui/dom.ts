// The only way this app builds DOM. Everything shown on the page, including model output and tool
// results (both untrusted), goes in as text. There is deliberately no way to pass HTML.

type Attrs = Record<string, string | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    // Event handler attributes would be a way to run code from a string. Wire events with addEventListener.
    if (/^on/i.test(name)) throw new Error(`el(): refusing to set event attribute "${name}"`);
    node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child); // strings become text nodes, never markup
  }
  return node;
}
