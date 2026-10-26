# Cursery -- [website](https://cursery.psychollama.io) / [docs](https://cursery.psychollama.io/docs/)

A framework for authoring web apps in pure Nix.

```nix
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
    } "Clicked ${toString count} times";
}
```

It runs in WebAssembly via [my Snix fork](https://github.com/PsychoLlama/snix), which is mostly just upstream plus a few filesystem patches.

## Project Name

It's a portmanteau: a **cursory** attempt at writing **cursed** code. Also something about cursors. Idk, I gave up while naming it.

## Why?

Brain damage.
