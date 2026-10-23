// @vitest-environment node

import * as cursery from "cursery";

import { load, nix } from "../testing.ts";

/**
 * Renders a server entrypoint returning `page`, with `html`, `svg`, and
 * `inputs` in scope.
 */
function render(page: string, inputs?: Record<string, unknown>) {
  using server = load({
    "default.nix": nix`inputs: let
      inherit (import <web/dom>) html svg;
    in ${page}`,
  });

  return cursery.renderToString(server.path, inputs);
}

/** Renders `body` in an otherwise empty page. */
function body(children: string) {
  const page = render(nix`html.html (html.body (${children}))`);
  return page.replace(/^<!doctype html><html><body>|<\/body><\/html>$/g, "");
}

describe("renderToString", () => {
  it("renders without a DOM", () => {
    expect(globalThis.document).toBeUndefined();
    expect(render(nix`html.html [ ]`)).toBe("<!doctype html><html></html>");
  });

  it("renders the whole page", () => {
    expect(
      render(nix`html.html { lang = "en"; } [
        (html.head (html.title "Hi"))
        (html.body (html.h1 "Hello"))
      ]`),
    ).toBe(
      '<!doctype html><html lang="en"><head><title>Hi</title></head><body><h1>Hello</h1></body></html>',
    );
  });

  it("renders entrypoints in subdirectories", () => {
    using server = load({
      "server/default.nix": nix`_: (import <web/dom>).html.html [ ]`,
    });

    expect(cursery.renderToString(`${server.path}/server`)).toBe(
      "<!doctype html><html></html>",
    );
  });

  describe("inputs", () => {
    it("passes them to the entrypoint", () => {
      expect(
        render(
          nix`html.html (map (src: html.script { inherit src; }) inputs.bundles)`,
          { bundles: ["/a.js", "/b.js"] },
        ),
      ).toBe(
        '<!doctype html><html><script src="/a.js"></script><script src="/b.js"></script></html>',
      );
    });

    it("defaults to an empty attrset", () => {
      expect(render(nix`html.html (builtins.toJSON inputs)`)).toBe(
        "<!doctype html><html>{}</html>",
      );
    });

    it("throws on inputs JSON can't represent", () => {
      expect(() => render(nix`html.html [ ]`, { big: 1n })).toThrow(/BigInt/);
    });
  });

  describe("the page", () => {
    it("must be an html element", () => {
      expect(() => render(nix`html.body [ ]`)).toThrow(
        /Invalid page: expected an `html` element/,
      );
      expect(() => render(nix`[ (html.html [ ]) ]`)).toThrow(/Invalid page/);
      expect(() => render(nix`svg.svg // { tag = "html"; }`)).toThrow(
        /Invalid page/,
      );
    });

    it("throws evaluation errors", () => {
      expect(() => render(nix`throw "boom"`)).toThrow(/boom/);
    });
  });

  describe("escaping", () => {
    it("escapes text", () => {
      expect(body(nix`html.p "<b>&\\"'</b>"`)).toBe(
        "<p>&lt;b&gt;&amp;\"'&lt;/b&gt;</p>",
      );
    });

    it("escapes attribute values", () => {
      expect(body(nix`html.p { title = "\\"<&>'"; }`)).toBe(
        '<p title="&quot;<&amp;>\'"></p>',
      );
    });

    it("rejects names that would end the tag", () => {
      expect(() => body(nix`html.p { "a b" = "c"; }`)).toThrow(
        /invalid attribute "a b" on <p>/,
      );
      expect(() => body(nix`html.p { "a>" = "c"; }`)).toThrow(
        /invalid attribute/,
      );
      expect(() => body(nix`(import <web/dom>).element "p onclick=x"`)).toThrow(
        /invalid tag "p onclick=x"/,
      );
      expect(() => body(nix`(import <web/dom>).element "1p"`)).toThrow(
        /invalid tag "1p"/,
      );
    });
  });

  describe("attributes", () => {
    it("renders them in order, omitting null and false", () => {
      expect(
        body(
          nix`html.input { type = "checkbox"; disabled = true; hidden = false; id = null; }`,
        ),
      ).toBe('<input disabled="" type="checkbox">');
    });

    it("renders classes", () => {
      expect(body(nix`html.p { class = [ "a" "b" ]; }`)).toBe(
        '<p class="a b"></p>',
      );
    });

    it("drops handlers", () => {
      expect(body(nix`html.button { on.click = event: null; } "Go"`)).toBe(
        "<button>Go</button>",
      );
    });
  });

  describe("properties", () => {
    it("renders input values and checks as attributes", () => {
      expect(
        body(nix`[
          (html.input { value = "a\\"b"; checked = true; })
          (html.input { value = null; checked = false; })
        ]`),
      ).toBe('<input checked="" value="a&quot;b"><input>');
    });

    it("renders textarea values as text, replacing children", () => {
      expect(body(nix`html.textarea { value = "<a>"; } "ignored"`)).toBe(
        "<textarea>&lt;a&gt;</textarea>",
      );
      expect(body(nix`html.textarea { value = null; } "ignored"`)).toBe(
        "<textarea></textarea>",
      );
      expect(body(nix`html.textarea "default"`)).toBe(
        "<textarea>default</textarea>",
      );
    });

    it("selects the first option matching a select's value", () => {
      expect(
        body(nix`html.select { value = "b"; } [
          (html.option { value = "a"; selected = true; } "A")
          (html.optgroup [
            (html.option { value = "b"; } "B")
            (html.option { value = "b"; } "B again")
          ])
        ]`),
      ).toBe(
        '<select><option value="a">A</option><optgroup><option value="b" selected="">B</option><option value="b">B again</option></optgroup></select>',
      );
    });

    it("matches options by text without a value", () => {
      expect(
        body(nix`html.select { value = "B c"; } [
          (html.option "A")
          (html.option "  B\n  c ")
        ]`),
      ).toBe(
        '<select><option>A</option><option selected="">  B\n  c </option></select>',
      );
    });

    it("keeps options' own selection without a select value", () => {
      expect(
        body(nix`html.select [
          (html.option "A")
          (html.option { selected = true; } "B")
        ]`),
      ).toBe(
        '<select><option>A</option><option selected="">B</option></select>',
      );
    });
  });

  it("keeps leading newlines in pre and textarea", () => {
    expect(
      body(
        nix`[ (html.pre "\nA") (html.textarea { value = "\nB"; }) (html.pre "C") ]`,
      ),
    ).toBe("<pre>\n\nA</pre><textarea>\n\nB</textarea><pre>C</pre>");
  });

  describe("void elements", () => {
    it("have no closing tag", () => {
      expect(body(nix`[ html.br (html.img { src = "a.png"; }) ]`)).toBe(
        '<br><img src="a.png">',
      );
    });

    it("can't have children", () => {
      expect(() => body(nix`html.br "text"`)).toThrow(
        /<br> can't have children/,
      );
    });
  });

  describe("SVG", () => {
    it("self-closes empty elements", () => {
      expect(
        body(nix`svg.svg { viewBox = "0 0 10 10"; } (svg.circle { r = 5; })`),
      ).toBe('<svg viewBox="0 0 10 10"><circle r="5"/></svg>');
    });

    it("escapes text in styles", () => {
      expect(body(nix`svg.svg (svg.style "a > b {}")`)).toBe(
        "<svg><style>a &gt; b {}</style></svg>",
      );
    });
  });

  describe("scripts", () => {
    it("render with a source", () => {
      expect(body(nix`html.script { src = "/app.js"; }`)).toBe(
        '<script src="/app.js"></script>',
      );
    });

    it("can't have children", () => {
      expect(() => body(nix`html.script "alert(1)"`)).toThrow(
        /<script> can't have children/,
      );
      expect(() => body(nix`svg.svg (svg.script "alert(1)")`)).toThrow(
        /<script> can't have children/,
      );
    });
  });

  describe("styles", () => {
    it("render their text as is", () => {
      expect(body(nix`html.style "a > b { content: \\"&\\"; }"`)).toBe(
        '<style>a > b { content: "&"; }</style>',
      );
    });

    it("can't close themselves early", () => {
      expect(() => body(nix`html.style "</STYLE><b>"`)).toThrow(
        /<style> can't contain "<\/style"/,
      );
    });

    it("can only contain text", () => {
      expect(() => body(nix`html.style (html.b "a")`)).toThrow(
        /<style> can only contain text/,
      );
    });
  });
});
