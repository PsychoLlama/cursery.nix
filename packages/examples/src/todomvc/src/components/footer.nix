let
  inherit (import <web/dom>) html;

  filters = import ./filters.nix;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # The count, filters, and clear button, with the filters centered.
  footer = css {
    display = "grid";
    grid-template-columns = "1fr auto 1fr";
    align-items = "center";
    padding = "0.75rem 1rem";
    border-top = "1px solid #e6e6e6";
    color = "#111";
  };

  clear = css {
    justify-self = "end";
    padding = 0;
    border = "none";
    background = "none";
    font = "inherit";
    color = "inherit";
    cursor = "pointer";
    "&:hover".text-decoration = "underline";
  };
in

{ todos, filter }:
let
  left = builtins.length (builtins.filter (todo: !todo.completed) todos);
  anyCompleted = builtins.any (todo: todo.completed) todos;
in
html.footer { class = footer; } [
  (html.span [
    (html.strong left)
    " ${if left == 1 then "item" else "items"} left"
  ])
  (filters { inherit filter; })
  (
    if anyCompleted then
      html.button {
        class = clear;
        on.click = event: dispatch "clearCompleted";
      } "Clear completed"
    else
      null
  )
]
