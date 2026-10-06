//! Recompiles the crate when the bundled Nix library (`nix/`) changes.
//!
//! On stable Rust, `include_dir!` can't track newly added files. Rerunning
//! this script forces a recompile instead.

fn main() {
    println!("cargo::rerun-if-changed=nix");
}
