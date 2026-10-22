import { fileURLToPath } from "node:url";
import cursery from "cursery/vite-plugin";
import { defineConfig } from "vite";

/** Absolute, since the build and dependency scan resolve from different roots. */
const page = (path: string) =>
  fileURLToPath(new URL(`src/${path}`, import.meta.url));

export default defineConfig({
  // Serves each example at `/<example>/`.
  root: "src",
  plugins: [cursery()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      // One page per example.
      input: [page("index.html"), page("hello-world/index.html")],
    },
  },
});
