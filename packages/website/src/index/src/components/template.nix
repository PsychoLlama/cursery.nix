# A link to getting started, beside the command to start from the flake
# template (with a button to copy it).

let
  inherit (import <web/dom>) html svg;
  inherit (import <web/io>) call dispatch pipe;
  inherit (import ../theme.nix) frame;

  command = "nix flake init -t github:PsychoLlama/cursery.nix";

  # A clipboard from Lucide, checked once copied.
  clipboard =
    checked:
    svg.svg
      {
        class = "size-4";
        viewBox = "0 0 24 24";
        fill = "none";
        stroke = "currentColor";
        stroke-width = 2;
        stroke-linecap = "round";
        stroke-linejoin = "round";
        aria-hidden = "true";
      }
      [
        (svg.rect {
          x = 8;
          y = 2;
          width = 8;
          height = 4;
          rx = 1;
        })

        (svg.path {
          d = "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2";
        })

        (if checked then svg.path { d = "m9 14 2 2 4-4"; } else null)
      ];

  # An arrow to the right, from Lucide.
  arrow =
    svg.svg
      {
        class = "size-4";
        viewBox = "0 0 24 24";
        fill = "none";
        stroke = "currentColor";
        stroke-width = 2;
        stroke-linecap = "round";
        stroke-linejoin = "round";
        aria-hidden = "true";
      }
      [
        (svg.path { d = "M5 12h14"; })
        (svg.path { d = "m12 5 7 7-7 7"; })
      ];

  # Shows a check for a couple of seconds.
  copy =
    _:
    pipe command [
      (call "copy")
      (_: dispatch "copied" true)
      (_: call "sleep" 2000)
      (_: dispatch "copied" false)
    ];
in

{ copied }:
html.div { class = "mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"; } [
  (html.a
    {
      href = "/docs/";
      class = "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#c8553d] px-5 py-2.5 font-medium text-white transition hover:bg-[#b2472f]";
    }
    [
      "Get started"
      arrow
    ]
  )

  (html.div { class = "${frame} relative min-w-0 flex-1 bg-[#2b2a33]"; } [
    (html.pre { class = "overflow-x-auto py-3 pr-14 pl-4 font-mono text-sm text-[#e8e1d4]"; } [
      (html.span { class = "text-[#b8d68a] select-none"; } "$ ")
      command
    ])

    (html.button {
      class = "absolute top-1/2 right-2 -translate-y-1/2 rounded-md bg-[#2b2a33]/80 p-2 text-[#e8e1d4]/70 transition hover:bg-[#403f47]/80 hover:text-[#e8e1d4] noscript:hidden";
      title = if copied then "Copied" else "Copy";
      aria-label = if copied then "Copied" else "Copy";
      on.click = copy;
    } (clipboard copied))
  ])
]
