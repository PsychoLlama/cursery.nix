// jsdom has constructed stylesheets, but can't adopt them. A plain property
// stands in, so tests can read what was adopted. Nothing applies the rules.
for (const { prototype } of [Document, ShadowRoot]) {
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
