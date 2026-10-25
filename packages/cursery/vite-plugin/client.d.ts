// Types for `?cursery:app`, `?cursery:store-path`, and `?cursery:files`
// imports. Add to `compilerOptions.types`, next to `vite/client`.

declare module "*?cursery:app" {
  const app: import("cursery/vite-plugin/runtime").App;
  export default app;
}

declare module "*?cursery:store-path" {
  /** The store path of the app's entry. */
  const path: string;
  export default path;
}

declare module "*?cursery:files" {
  /** The app's Nix sources by path, for `load` from `cursery`. */
  const files: Record<string, string>;
  export default files;
}
