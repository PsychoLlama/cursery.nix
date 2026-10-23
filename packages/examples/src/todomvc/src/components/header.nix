let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Sits above the card, which leaves room for it.
  title = css ''
    position: absolute;
    top: -140px;
    width: 100%;
    text-align: center;
    font-size: 80px;
    font-weight: 200;
    color: #b83f45;
    text-rendering: optimizeLegibility;
  '';

  new-todo = css ''
    box-sizing: border-box;
    width: 100%;
    height: 65px;
    margin: 0;
    padding: 16px 16px 16px 60px;
    border: none;
    background: rgb(0 0 0 / 0.003);
    box-shadow: inset 0 -2px 1px rgb(0 0 0 / 0.03);
    font: inherit;
    font-size: 24px;
    line-height: 1.4em;
    color: inherit;

    &:focus { box-shadow: 0 0 2px 2px #cf7d7d; }

    &::placeholder {
      font-style: italic;
      font-weight: 400;
      color: rgb(0 0 0 / 0.4);
    }
  '';
in

{ }:
html.header [
  (html.h1 { class = title; } "todos")

  # Always empty: adding re-renders, which clears what was typed.
  (html.input {
    class = new-todo;
    placeholder = "What needs to be done?";
    autofocus = true;
    value = "";
    on.keydown = event: if event.key == "Enter" then dispatch "add" event.target.value else null;
  })
]
