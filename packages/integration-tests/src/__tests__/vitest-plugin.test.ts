// @vitest-environment node

import app from "cursery/vite-plugin";
import cursery from "cursery/vitest";
import { type InlineConfig, type PluginOption, resolveConfig } from "vite";

/** The `test` settings Vitest would see, given the user's own. */
async function settings(test: object, plugins: PluginOption[] = [cursery()]) {
  const resolved = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      mode: "test",
      plugins,
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

describe("vitest settings", () => {
  it("loads cursery's bindings untransformed, keeping other externals", async () => {
    const { server } = await settings({
      server: { deps: { external: ["other"] } },
    });

    expect(server.deps.external).toEqual(["other", /\/cursery\/dist\//]);
  });

  it("adds its setup file after the user's", async () => {
    const { setupFiles } = await settings({ setupFiles: ["./mine.ts"] });

    expect(setupFiles).toEqual(["./mine.ts", "cursery/testing/setup"]);
  });

  it("is applied by the Vite plugin", async () => {
    const { server, setupFiles } = await settings({}, [app()]);

    expect(server.deps.external).toEqual([/\/cursery\/dist\//]);
    expect(setupFiles).toEqual(["cursery/testing/setup"]);
  });

  it("applies once alongside the Vite plugin", async () => {
    const { server, setupFiles } = await settings({}, [app(), cursery()]);

    expect(server.deps.external).toEqual([/\/cursery\/dist\//]);
    expect(setupFiles).toEqual(["cursery/testing/setup"]);
  });
});
