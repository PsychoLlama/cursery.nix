/**
 * Test helpers. Resources are disposable, for use with `using`:
 *
 * ```ts
 * using app = load({ "default.nix": nix`{ render = state: "hi"; }` });
 * using view = mount(app.path);
 * ```
 */

import * as cursery from "cursery";

/**
 * Nix source, for editors that highlight tagged templates by language.
 * Interpolates like an untagged template.
 */
export function nix(strings: TemplateStringsArray, ...values: unknown[]) {
  return String.raw({ raw: strings }, ...values);
}

/** Loads `files`, unloading them once disposed. */
export function load(files: Record<string, string>) {
  const path = cursery.load(files);

  return { path, [Symbol.dispose]: () => cursery.unload(path) };
}

/** Mounts `path` into `container`, unmounting it once disposed. */
export function mount(
  path: string,
  container: HTMLElement = document.createElement("div"),
) {
  cursery.mount(container, path);

  return { container, [Symbol.dispose]: () => cursery.unmount(container) };
}
