let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Sits in the new todo field's padding, lined up with the items' toggles.
  toggleAll = css {
    position = "absolute";
    top = "1.25rem";
    left = "1rem";
    width = "1.5rem";
    height = "1.5rem";
    margin = 0;
    accent-color = "#5dc2af";
  };
in

{ todos }:
html.input {
  class = toggleAll;
  type = "checkbox";
  "aria-label" = "Mark all as complete";
  checked = builtins.all (todo: todo.completed) todos;
  on.change = event: dispatch "toggleAll" event.target.checked;
}
