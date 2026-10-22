let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  footer = css {
    display = "flex";
    align-items = "center";
    padding = "0.75rem 1rem";
    border-top = "1px solid #e6e6e6";
    color = "#111";
  };

  clear = css {
    margin-left = "auto";
    padding = 0;
    border = "none";
    background = "none";
    font = "inherit";
    color = "inherit";
    cursor = "pointer";
    "&:hover".text-decoration = "underline";
  };
in

{ todos }:
let
  left = builtins.length (builtins.filter (todo: !todo.completed) todos);
  anyCompleted = builtins.any (todo: todo.completed) todos;
in
html.footer { class = footer; } [
  (html.span [
    (html.strong left)
    " ${if left == 1 then "item" else "items"} left"
  ])
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
