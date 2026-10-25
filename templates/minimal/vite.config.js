import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cursery({
      pages: {
        "index.html": {
          entry: {
            server: "./src/page.nix",

            client: {
              type: "nix",
              path: "./src/app",

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
