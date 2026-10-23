// @vitest-environment node

import * as cursery from "cursery";

import { load, nix } from "../testing.ts";

/**
 * Renders `app` with `render` from `<web/server>`, returning its children,
 * rendered into a body, and its styles. `html` and `style` are in scope.
 */
function render(app: string) {
  using server = load({
    "default.nix": nix`_: let
      inherit (import <web/dom>) html;
      inherit (import <web/server>) render;
      style = import <web/style>;
      app = render (${app});
    in html.html [ (html.style app.styles) (html.body app.children) ]`,
  });

  const page = cursery.renderToString(server.path);
  const [, styles, body] = /<style>(.*)<\/style><body>(.*)<\/body>/s.exec(
    page,
  )!;
  return { styles: styles!, body: body! };
}

describe("render", () => {
  it("renders the initial state", () => {
    expect(
      render(nix`{
        init = { name = "world"; };
        update = state: action: state;
        render = state: html.h1 "Hello, \${state.name}";
      }`),
    ).toEqual({ styles: "", body: "<h1>Hello, world</h1>" });
  });

  it("renders apps without state", () => {
    expect(render(nix`{ render = state: builtins.toJSON state; }`).body).toBe(
      "{}",
    );
  });

  it("renders nothing without a render", () => {
    expect(render(nix`{ }`).body).toBe("");
  });

  it("checks the app", () => {
    expect(() => render(nix`{ init = 1; }`)).toThrow(
      /Apps with `init` or `update` must define both/,
    );
  });

  describe("styles", () => {
    it("includes global styles", () => {
      expect(render(nix`{ styles.body.margin = 0; }`).styles).toBe(
        "@layer base { body { margin: 0; } }",
      );
    });

    it("includes classes once, in tree order", () => {
      const { styles } = render(nix`let
        a = style.css { color = "red"; };
        b = style.css { color = "blue"; };
      in {
        styles.body.margin = 0;
        render = _: html.div { class = b; } [
          (html.p { class = a; })
          (html.p { class = [ b a ]; })
        ];
      }`);

      expect(styles.split("\n")).toEqual([
        "@layer base { body { margin: 0; } }",
        expect.stringMatching(
          /^@layer components \{ \.s-\w+ \{ color: blue; \} \}$/,
        ),
        expect.stringMatching(
          /^@layer components \{ \.s-\w+ \{ color: red; \} \}$/,
        ),
      ]);
    });

    it("rejects different styles with the same name", () => {
      expect(() =>
        render(nix`{
          render = _: [
            (html.p { class = { _type = "style"; name = "s"; css = "a"; }; })
            (html.p { class = { _type = "style"; name = "s"; css = "b"; }; })
          ];
        }`),
      ).toThrow(/Different styles hash to the same class name/);
    });
  });

  it("renders a client passed in by path", () => {
    using client = load({
      "app/default.nix": nix`{ render = _: (import <web/dom>).html.p "client"; }`,
    });
    using server = load({
      "default.nix": nix`{ client, bundles }: let
        inherit (import <web/dom>) html;
        app = (import <web/server>).render (import client);
      in html.html [
        (html.head (map (src: html.script { type = "module"; inherit src; }) bundles))
        (html.body (html.div { id = "app"; } app.children))
      ]`,
    });

    expect(
      cursery.renderToString(server.path, {
        client: `${client.path}/app`,
        bundles: ["/client.js"],
      }),
    ).toBe(
      '<!doctype html><html><head><script src="/client.js" type="module"></script></head><body><div id="app"><p>client</p></div></body></html>',
    );
  });
});
