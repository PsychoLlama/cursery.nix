// Builds the Vite and Vitest plugins, and the testing setup. The wasm bindings are built by
// `bin/build`, into the same `dist`.

import { dts } from "rolldown-plugin-dts";
import { defineConfig } from "vite";

export default defineConfig({
  // Keeps Vite from transforming the declarations `dts` bundles.
  oxc: { exclude: [/\.js$/, /\.d\.[cm]?ts$/] },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        "vite-plugin/index": "vite-plugin/index.ts",
        "vite-plugin/runtime": "vite-plugin/runtime.ts",
        "vitest/index": "vitest/index.ts",
        "testing/setup": "testing/setup.ts",
      },
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
