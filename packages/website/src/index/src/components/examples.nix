let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix)
    heading
    frame
    repository
    ;

  examples = [
    {
      href = "${repository}/blob/main/packages/website/src/index/src/components/examples.nix";
      name = "This website";
      body = "The page you're reading now is written in Nix, including the interactive demo.";
    }
    {
      href = "/docs/";
      name = "Documentation";
      body = "Authored in Nix and pre-rendered to static pages.";
    }
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
]
