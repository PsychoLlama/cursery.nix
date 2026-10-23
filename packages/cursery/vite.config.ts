// Builds the Vite plugin. The wasm bindings are built by `bin/build`.

import { dts } from "rolldown-plugin-dts";
import { defineConfig } from "vite";

export default defineConfig({
  // Keeps Vite from transforming the declarations `dts` bundles.
  oxc: { exclude: [/\.js$/, /\.d\.[cm]?ts$/] },
  build: {
    outDir: "dist/vite-plugin",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: ["vite-plugin/index.ts", "vite-plugin/runtime.ts"],
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["cursery", /^vite(\/|$)/, /^node:/],
      // Every export is annotated, so oxc generates declarations without a
      // type checker.
      plugins: [dts({ generator: "oxc" })],
    },
  },
});
