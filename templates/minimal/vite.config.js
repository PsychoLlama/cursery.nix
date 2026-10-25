import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [
    cursery({
      pages: {
        "index.html": {
          entry: {
            server: "./page.nix",

            client: {
              type: "nix",
              path: "./app",

              // [Optional] Add `./src/effects.ts` to provide effects for Nix
              // to invoke using `io.call`.
              effects: undefined,
            },
          },
        },
      },
    }),
  ],

  // [Optional] For tests, with Vitest and jsdom installed.
  test: {
    environment: "jsdom",
  },
});
