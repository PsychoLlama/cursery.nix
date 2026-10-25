let
  inherit (import <web/dom>) html;

  filters = import ./filters.nix;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # The count and clear button float to either side of the centered
  # filters. Beneath, the card's edge looks like a stack of pages.
  footer = css ''
    height: 20px;
    padding: 10px 15px;
    border-top: 1px solid #e6e6e6;
    font-size: 15px;
    text-align: center;

    &::before {
      content: "";
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      height: 50px;
      overflow: hidden;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.2), 0 8px 0 -3px #f6f6f6, 0 9px 1px -3px rgb(0 0 0 / 0.2), 0 16px 0 -6px #f6f6f6, 0 17px 2px -6px rgb(0 0 0 / 0.2);
    }
  '';

  count = css ''
    float: left;
    text-align: left;

    & strong { font-weight: 300; }
  '';

  clear = css ''
    position: relative;
    float: right;
    line-height: 19px;
    cursor: pointer;

    &:hover { text-decoration: underline; }
  '';
in

{ todos, filter }:
let
  left = builtins.length (builtins.filter (todo: !todo.completed) todos);
  anyCompleted = builtins.any (todo: todo.completed) todos;
in
html.footer { class = footer; } [
  (html.span { class = count; } [
    (html.strong left)
    " ${if left == 1 then "item" else "items"} left"
  ])
  (filters { inherit filter; })
  (
    if anyCompleted then
      html.button {
        class = clear;
        on.click = event: dispatch "clearCompleted" null;
      } "Clear completed"
    else
      null
  )
]
