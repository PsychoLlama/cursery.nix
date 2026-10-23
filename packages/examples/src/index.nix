let
  inherit (import <web/dom>) html;
in
import ./layout.nix "cursery.nix examples" [
  (html.h1 "Examples")
  (html.ul [
    (html.li (html.a { href = "/hello-world/"; } "Hello world"))
    (html.li (html.a { href = "/todomvc/"; } "TodoMVC"))
  ])
]
