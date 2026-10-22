let
  inherit (import <web/dom>) html;
in

{
  render = state: html.h1 "todos";
}
