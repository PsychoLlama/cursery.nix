// Types for `.nix` imports. Add to `compilerOptions.types`, next to
// `vite/client`.

declare module "*.nix" {
  const app: import("cursery/vite-plugin/runtime").App;
  export default app;
}
