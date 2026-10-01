{
  description = "dom.nix: web apps authored with Nix";

  inputs = {
    systems.url = "github:nix-systems/default";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      fenix,
      systems,
    }:

    let
      inherit (nixpkgs) lib;

      overlays = [ fenix.overlays.default ];

      eachSystem = lib.flip lib.mapAttrs (
        lib.genAttrs (import systems) (
          system:
          import nixpkgs {
            inherit system overlays;
          }
        )
      );
    in

    {
      devShells = eachSystem (
        system: pkgs: {
          default = pkgs.mkShell {
            packages = [
              (pkgs.fenix.combine [
                pkgs.fenix.targets.wasm32-unknown-unknown.stable.rust-std
                (pkgs.fenix.stable.withComponents [
                  "cargo"
                  "clippy"
                  "rust-analyzer"
                  "rust-src"
                  "rustc"
                  "rustfmt"
                ])
              ])

              pkgs.cargo-nextest
              pkgs.just
              pkgs.nixfmt
              pkgs.prettier
              pkgs.treefmt
            ];
          };
        }
      );
    };
}
