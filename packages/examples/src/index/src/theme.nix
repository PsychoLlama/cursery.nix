# Pieces the components share.
let
  inherit (import <web/dom>) html;
in
{
  repository = "https://github.com/PsychoLlama/cursery.nix";
  snix = "https://snix.dev";

  heading = html.h2 { class = "text-2xl font-semibold tracking-tight"; };
  link = "text-[#3a7d7c] underline decoration-1 underline-offset-4 hover:text-[#c8553d]";

  # Inline code, in prose.
  code = html.code { class = "rounded bg-[#2b2a33]/[0.07] px-1 py-0.5 font-mono text-[0.85em]"; };

  # Panels and code blocks.
  frame = "overflow-hidden rounded-lg border border-[#2b2a33]/15";
}
