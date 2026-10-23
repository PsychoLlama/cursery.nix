// Types for `?cursery=app` imports. Add to `compilerOptions.types`, next to
// `vite/client`.

declare module "*?cursery=app" {
  const app: import("cursery/vite-plugin/runtime").App;
  export default app;
}
