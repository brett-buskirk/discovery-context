// SVG counterpart to el(): attributes are set one by one, text goes in as text. No markup strings.
const NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (/^on/i.test(name)) throw new Error(`svgEl(): refusing to set event attribute "${name}"`);
    node.setAttribute(name, String(value));
  }
  node.append(...children);
  return node;
}
