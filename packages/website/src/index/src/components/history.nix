let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) heading link;
in

{ }:
html.section [
  (heading "History")
  (html.div { class = "mt-2 space-y-4 text-[#4a4853]"; } [
    (html.p [
      "Cursery started as a joke. It's still a joke. "
      (html.em "This is not a serious project.")
    ])
    (html.p [
      (html.a {
        href = "https://2026.nixcon.org/";
        class = link;
      } "NixCon 2026")
      " had two extra days for hacking, and while I didn't have any good project ideas, I did have some evil ones."
    ])
    (html.p "Cursery's first prototype surprised me. Eval times are notoriously slow, and yet counters could increment at a cool 60fps. A wonder of science. How much more dirt could I dig from this grave?")
    (html.p "I spent another week evolving it into a plausible web framework. There's more to build, but I miss my free time, and this feels like a good place to stop.")
  ])
]
