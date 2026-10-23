// jsdom has constructed stylesheets, but can't adopt them. A plain property
// stands in, so tests can read what was adopted. Nothing applies the rules.
// Tests in the node environment have no DOM to patch.
const roots = globalThis.Document ? [Document, ShadowRoot] : [];
for (const { prototype } of roots) {
  if (!("adoptedStyleSheets" in prototype)) {
    const adopted = new WeakMap<object, CSSStyleSheet[]>();

    Object.defineProperty(prototype, "adoptedStyleSheets", {
      configurable: true,
      get(this: object) {
        return adopted.get(this) ?? [];
      },
      set(this: object, sheets: CSSStyleSheet[]) {
        adopted.set(this, sheets);
      },
    });
  }
}
