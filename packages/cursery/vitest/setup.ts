/**
 * Runs before each test file (see `index.ts`).
 *
 * jsdom has constructed stylesheets, but can't adopt them, which apps with
 * styles do as they mount. A plain property stands in, so tests can read
 * what was adopted. Nothing applies the rules. Environments without a DOM
 * are left alone.
 */

const roots: { prototype: object }[] = globalThis.Document
  ? [Document, ShadowRoot]
  : [];
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
