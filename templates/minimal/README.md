# Cursery App

A web app written in Nix with [cursery](https://github.com/PsychoLlama/cursery.nix).

## Developing

```bash
nix develop
pnpm install
pnpm dev
```

## Structure

- `src/app/`: application code authored in Nix.
- `src/page.nix`: pre-renders HTML pages in dev and production builds.
