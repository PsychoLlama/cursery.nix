let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  # Generated CSS classes, attached with `class`.
  heading = css ''
    margin: 0 0 1.5rem;
    font-variant-numeric: tabular-nums;
  '';

  controls = css ''
    display: flex;
    gap: 0.75rem;
  '';

  button = css ''
    width: 3rem;
    height: 3rem;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 0.75rem;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.1s;

    &:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }

    &:active {
      background: color-mix(in srgb, currentColor 15%, transparent);
    }
  '';
in

{
  # Global styles for the page.
  styles = ''
    :root {
      color-scheme: light dark;
    }

    body {
      font: 18px/1.6 system-ui, sans-serif;
      max-width: 40rem;
      margin: 4rem auto;
      padding: 0 1rem;
    }
  '';

  # Initial state. Passed to `update`.
  init = 0;

  # Respond to events from `dispatch`.
  update = count: action: if action.type == "increment" then count + 1 else count - 1;

  # Render the page.
  render = count: [
    (html.h1 { class = heading; } "Clicked ${toString count} times")

    (html.div { class = controls; } [
      (html.button {
        class = button;
        aria-label = "Decrement";
        on.click = event: dispatch "decrement" null;
      } "−")

      (html.button {
        class = button;
        aria-label = "Increment";
        on.click = event: dispatch "increment" null;
      } "+")
    ])
  ];
}
