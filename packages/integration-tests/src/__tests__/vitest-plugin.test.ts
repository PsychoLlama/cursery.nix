// @vitest-environment node

import cursery from "cursery/vitest";
import { type InlineConfig, resolveConfig } from "vite";

/** The `test` settings Vitest would see, given the user's own. */
async function settings(test: object) {
  const resolved = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      plugins: [cursery()],
      test,
    } as InlineConfig,
    "serve",
  );

  return (
    resolved as unknown as {
      test: { server: { deps: { external: unknown[] } }; setupFiles: string[] };
    }
  ).test;
}

describe("vitest plugin", () => {
  it("loads cursery's bindings untransformed, keeping other externals", async () => {
    const { server } = await settings({
      server: { deps: { external: ["other"] } },
    });

    expect(server.deps.external).toEqual(["other", /\/cursery\/dist\//]);
  });

  it("adds its setup file after the user's", async () => {
    const { setupFiles } = await settings({ setupFiles: ["./mine.ts"] });

    expect(setupFiles).toEqual([
      "./mine.ts",
      expect.stringMatching(/\/cursery\/dist\/vitest\/setup\.js$/),
    ]);
  });
});
