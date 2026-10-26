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
- Code formats automatically after edits.
- Co-locate tests with source: `foo/bar.ts` is tested in `foo/__tests__/bar.test.ts`.

# Nix Code Style

Additional rules extending `nixfmt`. In case of conflict, prefer `nixfmt` output.

## Bindings

- `let ... in` blocks get a blank line before `let` and after `in`.
- Except on the first line of a file or docs code sample: no leading blank line.
- Except inside `if` branches: leave `then`/`else` attached.

## Markup

- Sibling elements spanning two or more lines get blank lines around them.
- Except in a run of text (a list with string siblings), like a link in a sentence.
- Lists of data (not elements) are exempt.
- Applies to code samples in docs and comments too.
