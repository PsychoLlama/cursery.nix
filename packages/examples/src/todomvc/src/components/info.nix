let
  inherit (import <web/dom>) html;
  inherit (import <web/style>) css;

  info = css ''
    margin: 65px auto 0;
    text-align: center;
    font-size: 11px;
    color: #4d4d4d;
    text-shadow: 0 1px 0 rgb(255 255 255 / 0.5);

    & p { line-height: 1; }

    & a {
      font-weight: 400;
      color: inherit;
      text-decoration: none;

      &:hover { text-decoration: underline; }
    }
  '';
in

{ }:
html.footer { class = info; } [
  (html.p "Double-click to edit a todo")
  (html.p [
    (html.a {
      href = "https://github.com/PsychoLlama/cursery.nix/tree/main/packages/examples/src/todomvc";
    } "Written in Nix")
    ", for some reason"
  ])
  (html.p [
    "Inspired by "
    (html.a { href = "https://todomvc.com"; } "TodoMVC")
  ])
]
