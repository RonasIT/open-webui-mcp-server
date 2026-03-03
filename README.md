# TypeScript project template

A template project for repos with TypeScript NPM packages.

## What's included

- **Repo structure**: `src/` for source, `dist/` as build output; `.github/workflows/`, `.husky/`, and config files (tsconfig, tsup, ESLint, Prettier) in place.
- **Build**: TypeScript with [tsup](https://tsup.egoist.dev/) — CJS + ESM output and `.d.ts` from `src/index.ts`.
- **Lint & format**: ESLint (flat config) and Prettier; `npm run lint`, `npm run format`.
- **Git hooks**: Husky + lint-staged — ESLint and Prettier on pre-commit.
- **CI**: GitHub Actions — validate (lint, test, build) on PR/push; release workflow publishes to npm on GitHub release (uses `NPM_TOKEN`).
- **Basic docs**: [CONTRIBUTING.md](./CONTRIBUTING.md) and [LICENSE](./LICENSE).

## How to use this template for npm packages

1. Create a new repo from this template (e.g. via GitHub “Use this template”).
1. **Update `package.json`**: set `name`, `description`, `repository`, `bugs`, `homepage`, and `keywords` for your package.
1. Run `npm install`
1. Implement your code in `src/` and run `npm run build` to produce the `dist/` output.
1. Publish with `npm run release` when ready.

See more details on how to run releases in [CONTRIBUTING.md](./CONTRIBUTING.md)
