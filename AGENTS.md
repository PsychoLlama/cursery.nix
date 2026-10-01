# Overview

- Bindings for building interactive web apps in pure Nix.
- Provides tools for VDOM, styles, state management, and side effects.
- Thin TypeScript adapter.
- Ships with Nix code providing interfaces and builders.
- Application code is provided by package consumers.

## Stack

- Snix crate for WASM evaluator.
- Node for integration tests.
- Packaged and bundled for npm.

# Development

- Use `just check` to run all checks. Rare. Prefer targeted commands.
- Code formats automatically. No need go manual.
- Co-locate tests with source: `foo/bar.ts` is tested in `foo/__tests__/bar.test.ts`.
