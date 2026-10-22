let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) dispatch;
  inherit (import <web/style>) css;

  filters = css {
    display = "flex";
    gap = "0.5rem";
    margin = 0;
    padding = 0;
    list-style = "none";
  };

  link = css {
    padding = "0.125rem 0.5rem";
    border = "1px solid transparent";
    border-radius = "3px";
    color = "inherit";
    text-decoration = "none";
    "&:hover".border-color = "#f1d4d5";
    "&[aria-current]".border-color = "#e9b8b9";
  };

  # Each filter by name, and its link's hash.
  options = [
    {
      name = "all";
      label = "All";
      hash = "#/";
    }
    {
      name = "active";
      label = "Active";
      hash = "#/active";
    }
    {
      name = "completed";
      label = "Completed";
      hash = "#/completed";
    }
  ];
in

# Following a link updates the hash as usual, and dispatches its filter.
{ filter }:
html.ul { class = filters; } (
  map (
    option:
    html.li [
      (html.a {
        class = link;
        aria-current = if option.name == filter then "page" else null;
        href = option.hash;
        on.click = event: dispatch "filter" option.name;
      } option.label)
    ]
  ) options
)
