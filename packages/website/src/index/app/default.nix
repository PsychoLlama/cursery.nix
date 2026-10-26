let
  inherit (import <web/dom>) html;

  header = import ./components/header.nix;
  intro = import ./components/intro.nix;
  demo = import ./components/demo.nix;
  template = import ./components/template.nix;
  features = import ./components/features.nix;
  examples = import ./components/examples.nix;
  history = import ./components/history.nix;
  thanks = import ./components/thanks.nix;
  footer = import ./components/footer.nix;

  # Drops a trailing newline.
  trimEnd =
    text:

    let
      length = builtins.stringLength text;
    in

    if length > 0 && builtins.substring (length - 1) 1 text == "\n" then
      builtins.substring 0 (length - 1) text
    else
      text;
in

{
  init = {
    # The demo's starting source, an app in its own right. Its trailing
    # newline would show as an empty line in the editor.
    source = trimEnd (builtins.readFile ./counter.nix);
    error = null;
    copied = false;
  };

  # Actions are named after the field they set.
  update = state: action: state // { ${action.type} = action.payload; };

  render = state: [
    (html.div { class = "mx-auto max-w-4xl px-6"; } [
      header

      (html.main { class = "space-y-20 pt-10 pb-20"; } [
        intro

        (html.section [
          (demo { inherit (state) source error; })
          (template { inherit (state) copied; })
        ])

        features
        examples
        history
        thanks
      ])

      footer
    ])
  ];
}
