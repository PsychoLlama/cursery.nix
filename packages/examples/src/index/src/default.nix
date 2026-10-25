let
  inherit (import <web/dom>) html;

  counter = import ./counter.nix;

  header = import ./components/header.nix;
  intro = import ./components/intro.nix;
  demo = import ./components/demo.nix;
  features = import ./components/features.nix;
  examples = import ./components/examples.nix;
  thanks = import ./components/thanks.nix;
  footer = import ./components/footer.nix;
in

{
  init = {
    counter = counter.init;
  };

  # The counter is the only thing that dispatches, so every action is its.
  update = state: action: state // { counter = counter.update state.counter action; };

  render = state: [
    (html.div { class = "mx-auto max-w-4xl px-6"; } [
      (header { })
      (html.main { class = "space-y-20 pt-10 pb-20"; } [
        (intro { })
        (demo { inherit (state) counter; })
        (features { })
        (examples { })
        (thanks { })
      ])
      (footer { })
    ])
  ];
}
