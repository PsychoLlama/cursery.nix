let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) heading link snix;
in

{ }:
html.section [
  (heading "Thanks, Snix")

  (html.p { class = "mt-2 text-[#4a4853]"; } [
    (html.a {
      href = snix;
      class = link;
    } "Snix")
    " is a Rust implementation of Nix. Its evaluator compiles to WebAssembly, which is the whole trick. Cursery wouldn't be possible without their incredible work."
  ])
]
