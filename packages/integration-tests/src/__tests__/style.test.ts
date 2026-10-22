import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/** The CSS `css` generates for `rules`, with its class name as `.s`. */
function css(rules: string): string {
  const style = cursery.evaluate(nix`(import <web/style>).css (${rules})`) as {
    name: string;
    css: string;
  };

  return style.css.replaceAll(style.name, "s");
}

/** Renders `code` with the DOM and style builders in scope. */
function render(code: string) {
  using app = load({
    "default.nix": nix`let
      inherit (import <web/dom>) html;
      inherit (import <web/style>) css;
    in {
      render = state: ${code};
    }`,
  });

  return mount(app.path);
}

/** Every rule adopted by `root`, in order. */
function loaded(root: Document | ShadowRoot = document): string[] {
  return root.adoptedStyleSheets.flatMap((sheet) =>
    Array.from(sheet.cssRules, (rule) => rule.cssText),
  );
}

describe("css", () => {
  it("scopes declarations to a class", () => {
    expect(css(nix`{ color = "red"; border-radius = "1rem"; }`)).toBe(
      "@layer components { .s { border-radius: 1rem; color: red; } }",
    );
  });

  it("names classes by their rules", () => {
    const name = (rules: string) =>
      cursery.evaluate(nix`((import <web/style>).css (${rules})).name`);

    expect(name(nix`{ color = "red"; }`)).toMatch(/^s-[0-9a-f]{8}$/);
    expect(name(nix`{ color = "red"; }`)).toBe(name(nix`{ color = "red"; }`));
    expect(name(nix`{ color = "red"; }`)).not.toBe(
      name(nix`{ color = "blue"; }`),
    );
  });

  it("repeats declarations for lists, in order", () => {
    expect(css(nix`{ display = [ "-webkit-box" "flex" ]; }`)).toBe(
      "@layer components { .s { display: -webkit-box; display: flex; } }",
    );
  });

  it("writes numbers as they are", () => {
    expect(css(nix`{ opacity = 0.5; z-index = 10; }`)).toBe(
      "@layer components { .s { opacity: 0.5; z-index: 10; } }",
    );
  });

  it("omits null values", () => {
    expect(css(nix`{ color = null; margin = [ null "0" ]; }`)).toBe(
      "@layer components { .s { margin: 0; } }",
    );
  });

  it("nests selectors and at-rules after declarations", () => {
    expect(
      css(nix`{
        "&:hover"."&:active".color = "red";
        "@media (width < 40rem)".padding = "0";
        padding = "1rem";
      }`),
    ).toBe(
      "@layer components { .s { padding: 1rem; &:hover { &:active { color: red; } } @media (width < 40rem) { padding: 0; } } }",
    );
  });

  it("rejects invalid values", () => {
    expect(() => css(nix`{ color = true; }`)).toThrow(
      /Invalid value for \W*color\W* of type bool/,
    );
  });

  it("rejects rules that aren't attrsets", () => {
    expect(() => css(nix`"color: red"`)).toThrow(
      /Invalid rules of type string/,
    );
  });
});

describe("styles", () => {
  it("sets the class name", () => {
    using view = render(
      nix`html.p { class = [ (css { color = "red"; }) "x" ]; }`,
    );
    const name = cursery.evaluate(
      nix`((import <web/style>).css { color = "red"; }).name`,
    );

    expect(view.container.innerHTML).toBe(`<p class="${name} x"></p>`);
  });

  it("accepts a style without a list", () => {
    using view = render(nix`html.p { class = css { color = "tan"; }; }`);

    expect(view.container.querySelector("p")!.className).toMatch(/^s-/);
  });

  it("loads the CSS of rendered styles", () => {
    using _ = render(nix`html.p { class = css { color = "olive"; }; }`);

    expect(loaded()).toContainEqual(expect.stringMatching(/color: olive;/));
  });

  it("loads each class once", () => {
    const style = nix`(css { color = "teal"; })`;
    using _ = render(
      nix`html.div { class = ${style}; } (html.p { class = ${style}; })`,
    );
    using _again = render(nix`html.p { class = ${style}; }`);

    expect(loaded().filter((rule) => rule.includes("teal"))).toHaveLength(1);
  });

  it("loads styles added by later renders", () => {
    using app = load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        inherit (import <web/style>) css;
      in {
        init = false;
        update = state: action: true;
        render = state: html.button {
          class = if state then css { color = "plum"; } else null;
          on.click = event: true;
        } "Go";
      }`,
    });
    using view = mount(app.path);

    view.container.querySelector("button")!.click();

    expect(loaded()).toContainEqual(expect.stringMatching(/color: plum;/));
  });

  it("adopts the sheet again if it's removed", () => {
    using _ = render(nix`html.p { class = css { color = "navy"; }; }`);
    document.adoptedStyleSheets = [];

    using _again = render(nix`html.p { class = css { color = "navy"; }; }`);

    expect(loaded()).toContainEqual(expect.stringMatching(/color: navy;/));
  });

  it("keeps other adopted sheets", () => {
    const other = new CSSStyleSheet();
    document.adoptedStyleSheets = [other];

    using _ = render(nix`html.p { class = css { color = "gold"; }; }`);

    expect(document.adoptedStyleSheets[0]).toBe(other);
    expect(loaded()).toContainEqual(expect.stringMatching(/color: gold;/));
  });

  it("adopts the sheet in shadow roots", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const container = root.appendChild(document.createElement("div"));
    using app = load({
      "default.nix": nix`let
        inherit (import <web/dom>) html;
        inherit (import <web/style>) css;
      in {
        render = state: html.p { class = css { color = "pink"; }; };
      }`,
    });

    using _ = mount(app.path, container);

    expect(loaded(root)).toContainEqual(expect.stringMatching(/color: pink;/));
  });

  it("rejects different styles with the same name", () => {
    const style = (color: string) =>
      nix`{ _type = "style"; name = "s-same"; css = ".s-same { color: ${color}; }"; }`;

    using _ = render(nix`html.p { class = ${style("red")}; }`);

    expect(() => render(nix`html.p { class = ${style("blue")}; }`)).toThrow(
      /Different styles hash to the same class name "s-same"/,
    );
  });

  it("rejects CSS that doesn't parse", () => {
    expect(() =>
      render(
        nix`html.p { class = { _type = "style"; name = "s-bad"; css = "}"; }; }`,
      ),
    ).toThrow(/Invalid CSS for class "s-bad": SyntaxError/);
  });

  it("drops styles replaced by a later `class`", () => {
    using _ = render(
      nix`(html.p { class = css { color = "coral"; }; }) { class = "x"; }`,
    );

    expect(loaded().join()).not.toMatch(/coral/);
  });

  it("rejects styles as children", () => {
    expect(() => render(nix`html.p (css { color = "red"; })`)).toThrow(
      /styles go in `class`/,
    );
  });
});
