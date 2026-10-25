import tailwind from "@tailwindcss/vite";
import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  // Serves each example at `/<example>/`.
  root: "src",
  plugins: [
    tailwind(),
    cursery({
      pages: {
        "index.html": {
          entry: {
            server: "./index/page.nix",
            client: { type: "nix", path: "./index/src" },
          },
        },
        "hello-world/index.html": {
          entry: {
            server: "./hello-world/page.nix",
            client: { type: "nix", path: "./hello-world/src" },
          },
        },
        "todomvc/index.html": {
          entry: {
            server: "./todomvc/page.nix",
            client: {
              type: "nix",
              path: "./todomvc/src",
              effects: "./todomvc/effects.ts",
            },
          },
        },
      },
    }),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
