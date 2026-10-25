import cursery from "cursery/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cursery()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/__tests__/*.test.ts"],
  },
});
