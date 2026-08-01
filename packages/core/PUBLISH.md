# `@emi/core` consumption and publishing

`@emi/core` is intentionally a single mixed-layer package. Actors, chat protocols,
headless web primitives, optional styled components, server persistence, and platform
adapters are separate capability subpaths rather than separate packages.

## Source-copy mode

This is the current fork-friendly mode. `create-chat-app` copies core source and tests into
an editable application workspace. The copied files become the application's ownership
boundary, like a shadcn distribution. A consumer can customize them locally and later sync
upstream deliberately by comparing the generated source against the core revision it was
copied from.

Source-copy consumers should:

- keep the generated core version/revision marker with the copied files;
- preserve the public subpath shape unless the app intentionally forks that contract;
- run the copied core tests plus the generated app acceptance suite after upgrades; and
- treat adapter implementations and product flavors as composition code, not core source.

## Dependency mode

Consumers can reuse the package without a fork through the exported subpaths, for example
`@emi/core/chat`, `@emi/core/web`, `@emi/core/web/styled`, `@emi/core/server`, and
`@emi/core/cloudflare`. Runtime dependencies are supplied through explicit adapters. Styled
and platform-specific consumers must not require those subpaths merely to use the headless
or chat layers. Product domains belong in separate flavor packages; `@emi/core/contract`
exports only generic contracts, while a product flavor may publish its own composition over
`CoreApi`.

## Registry readiness

The workspace remains private and source-oriented today. Do not publish until the registry
mode has all of the following:

- emitted ESM JavaScript and declaration files for every supported subpath;
- curated exports with documented runtime and optional/peer dependency boundaries;
- package metadata, license, and README suitable for external consumers; and
- a packed-install smoke test that imports each supported subpath from a clean consumer.

When that gate is satisfied:

1. Bump `version` in `package.json`.
2. Set `"private": false`.
3. Set `files` and `exports` to emitted artifacts, not workspace TypeScript sources.
4. Run `pnpm --filter @emi/core exec npm publish --dry-run`.
5. Publish with `pnpm --filter @emi/core publish --access public`.
