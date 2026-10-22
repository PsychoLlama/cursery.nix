let
  inherit (import <web/dom>) html;
  inherit (import <web/style>) css;

  todoItem = import ./todo-item.nix;

  list = css {
    margin = 0;
    padding = 0;
    list-style = "none";
  };
in

{ todos, editing }:
html.ul { class = list; } (
  map (
    todo:
    todoItem {
      inherit todo;
      editing = editing == todo.id;
    } { key = todo.id; }
  ) todos
)
