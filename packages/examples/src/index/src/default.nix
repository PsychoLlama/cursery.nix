let
  inherit (import <web/dom>) html;

  counter = import ./counter.nix;

  header = import ./components/header.nix;
  intro = import ./components/intro.nix;
  demo = import ./components/demo.nix;
  template = import ./components/template.nix;
  features = import ./components/features.nix;
  examples = import ./components/examples.nix;
  thanks = import ./components/thanks.nix;
  footer = import ./components/footer.nix;
in

{
  init = {
    counter = counter.init;
    copied = false;
  };

  # Every action but `copied` is the counter's.
  update =
    state: action:
    if action.type == "copied" then
      state // { copied = action.payload; }
    else
      state // { counter = counter.update state.counter action; };

  render = state: [
    (html.div { class = "mx-auto max-w-4xl px-6"; } [
      header
      (html.main { class = "space-y-20 pt-10 pb-20"; } [
        intro
        (html.section [
          (demo { inherit (state) counter; })
          (template { inherit (state) copied; })
        ])
        features
        examples
        thanks
      ])
      footer
    ])
  ];
}
