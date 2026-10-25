// Types for `?cursery:app`, `?cursery:source`, and `?cursery:raw` imports.
// Add to `compilerOptions.types`, next to `vite/client`.

declare module "*?cursery:app" {
  const app: import("cursery/vite-plugin/runtime").App;
  export default app;
}

declare module "*?cursery:source" {
  /** The store path of the app's entry. */
  const path: string;
  export default path;
}

declare module "*?cursery:raw" {
  /** The app's Nix sources by path, for `load` from `cursery`. */
  const files: Record<string, string>;
  export default files;
}
