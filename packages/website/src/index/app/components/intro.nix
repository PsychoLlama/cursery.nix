let
  inherit (import <web/dom>) html svg;
  inherit (import ../theme.nix) link;

  # An "i" in a circle, from Lucide.
  info =
    svg.svg
      {
        class = "mt-0.5 size-4 shrink-0";
        viewBox = "0 0 24 24";
        fill = "none";
        stroke = "currentColor";
        stroke-width = 2;
        stroke-linecap = "round";
        aria-hidden = "true";
      }
      [
        (svg.circle {
          cx = 12;
          cy = 12;
          r = 10;
        })

        (svg.path { d = "M12 16v-4"; })
        (svg.path { d = "M12 8h.01"; })
      ];
in

{ }:
html.section [
  (html.h1 {
    class = "text-4xl font-semibold tracking-tight sm:text-5xl";
  } "Interactive web apps in pure Nix")

  (html.p { class = "mt-5 text-lg"; } [
    "Elements, styles, state, and side effects, all written in Nix. "
    (html.a {
      href = "https://www.npmjs.com/package/cursery";
      class = link;
    } "Available on npm")
    " as pre-built WebAssembly."
  ])

  (html.aside
    {
      class = "mt-8 flex items-start gap-3 rounded-lg border border-[#2b2a33]/15 bg-[#2b2a33]/[0.04] px-4 py-3 text-sm text-[#4a4853]";
    }
    [
      info
      "Cursery is slopped, vibed, and hacked to glory. This is not a place of honor."
    ]
  )
]
