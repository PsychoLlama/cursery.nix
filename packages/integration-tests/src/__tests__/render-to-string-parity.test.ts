import * as cursery from "cursery";

import { load, mount, nix } from "../testing.ts";

/**
 * Reads the body `children` renders to, mounted and rendered to a string
 * then parsed into the DOM. They should match.
 */
function both<T>(children: string, read: (body: Element) => T) {
  using files = load({
    "app/default.nix": nix`let inherit (import <web/dom>) html svg; in {
      render = _: ${children};
    }`,
    "server/default.nix": nix`_: let inherit (import <web/dom>) html svg; in
      html.html (html.body (${children}))`,
  });

  using view = mount(`${files.path}/app`);
  const page = new DOMParser().parseFromString(
    cursery.renderToString(`${files.path}/server`),
    "text/html",
  );

  return { mounted: read(view.container), rendered: read(page.body) };
}

/** The state of each form control in `root`, in tree order. */
function controls(root: Element) {
  return Array.from(
    root.querySelectorAll("input, textarea, select, option"),
    (control) =>
      control instanceof HTMLInputElement
        ? { value: control.value, checked: control.checked }
        : control instanceof HTMLOptionElement
          ? { selected: control.selected }
          : {
              value: (control as HTMLTextAreaElement | HTMLSelectElement).value,
            },
  );
}

describe("renderToString parity with mount", () => {
  it("renders the same markup", () => {
    const { mounted, rendered } = both(
      nix`[
      (html.h1 { class = [ "a" "b" ]; title = "\\"<&>"; } "Hi & <bye>")
      (html.p [ "text" html.br (html.img { src = "a.png"; alt = ""; }) ])
      (html.button { on.click = _: null; disabled = true; hidden = false; } "Go")
      (svg.svg { viewBox = "0 0 10 10"; } [ (svg.circle { r = 5; }) (svg.text "<t>") ])
      (html.pre "\nindented")
      (html.ul (map (n: html.li { key = n; } (toString n)) [ 1 2 3 ]))
    ]`,
      (body) => body.innerHTML,
    );

    expect(rendered).toBe(mounted);
  });

  it("renders the same form state", () => {
    const { mounted, rendered } = both(
      nix`[
      (html.input { value = "typed"; })
      (html.input { type = "checkbox"; checked = true; })
      (html.input { type = "checkbox"; checked = false; })
      (html.textarea { value = "long\ntext"; } "default")
      (html.textarea { value = "\nleading"; })
      (html.select { value = "b"; } [
        (html.option { value = "a"; } "A")
        (html.option { value = "b"; } "B")
      ])
      (html.select { value = "C"; } [ (html.option "B") (html.option " C ") ])
      (html.select [ (html.option "A") (html.option { selected = true; } "B") ])
    ]`,
      controls,
    );

    expect(rendered).toEqual(mounted);
  });
});
