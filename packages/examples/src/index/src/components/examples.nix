let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix)
    heading
    frame
    link
    repository
    ;

  examples = [
    {
      href = "/hello-world/";
      name = "Hello world";
      body = "Type your name, see text update.";
    }
    {
      href = "/todomvc/";
      name = "TodoMVC";
      body = "The classic todo list, with filters and editing.";
    }
  ];
in

{ }:
html.section { id = "examples"; } [
  (heading "Examples")
  (html.ul { class = "mt-6 grid gap-6 sm:grid-cols-2"; } (
    map (
      example:
      html.li [
        (html.a
          {
            inherit (example) href;
            class = "${frame} block bg-white p-5 transition hover:border-[#2b2a33]/30 hover:bg-[#fbf8f2]";
          }
          [
            (html.h3 { class = "font-semibold text-[#3a7d7c]"; } "${example.name} →")
            (html.p { class = "mt-1 text-[#4a4853]"; } example.body)
          ]
        )
      ]
    ) examples
  ))
  (html.p { class = "mt-6 text-[#4a4853]"; } [
    "This page itself! The entire site is written in Nix, pre-rendered and hydrated. "
    (html.a {
      href = "${repository}/tree/main/packages/examples/src/index";
      class = link;
    } "See the source")
    "."
  ])
]
