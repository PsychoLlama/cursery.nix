# The demo's starting source, as `builtins.readFile` isn't available.
''
  let
    inherit (import <web/dom>) html;
    inherit (import <web/io>) dispatch;
  in
  {
    init = 0;
    update = count: action: count + 1;
    render =
      count:
      html.button {
        on.click = event: dispatch "increment" null;
      } "Clicked ''${toString count} times";
  }
''
