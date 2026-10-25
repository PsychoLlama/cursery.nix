// Types for `?cursery:app` and `?cursery:source` imports. Add to
// `compilerOptions.types`, next to `vite/client`.

declare module "*?cursery:app" {
  const app: import("cursery/vite-plugin/runtime").App;
  export default app;
}

declare module "*?cursery:source" {
  /** The store path of the app's entry. */
  const path: string;
  export default path;
}
