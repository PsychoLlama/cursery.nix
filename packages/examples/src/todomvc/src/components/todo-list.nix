let
  inherit (import <web/dom>) html;
in

{ todos }:
html.ul (
  map (
    todo:
    html.li {
      key = todo.id;
    } todo.text
  ) todos
)
