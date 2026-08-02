# Anti-slop checks

The anti-slop directory contains repository-specific rules that keep the clean-slate
architecture mechanically visible. It is intentionally separate from `.antislop.jsonl`:

- `.antislop.jsonl` records the decision and the preferred correction for humans and agents.
- `anti-slop/rules/` contains executable ast-grep rules for syntax patterns.
- `anti-slop/tests/` contains small valid/invalid examples for each executable rule.
- `scripts/check-architecture-boundaries.mjs` checks repository topology and import boundaries
  that are clearer and safer to express with filesystem-aware code than AST matching.

Run the checks with:

```bash
pnpm slop:check
pnpm slop:test
```

## Rules

The current checks protect these boundaries:

- generic core stays free of product, provider, and platform leakage;
- compatibility aliases and migration packages do not re-enter the source tree;
- `index.ts` is not an internal implementation or import target;
- public boundaries use explicit `.export.ts` files and do not use export-from barrels;
- Effect server services are composed with `Context.Service` and `Layer`, not constructor DI;
- persistence code maps rows explicitly and stays behind ports/adapters;
- external JSON, URLs, HTTP input, tagged errors, and schemas use the established typed policies;
- generic chat rendering, scrolling, and runtime state belong in `@emi/core`, while products supply
  only product renderers, extensions, and configuration.

When a new smell is found, add its human rule with `antislop add`, then add the smallest
deterministic rule or boundary assertion that can prevent recurrence. Every executable rule must
have at least one valid and one invalid fixture.

Rules are deliberately narrow. A rule should reject a known correctness or architecture failure,
not encode personal formatting preferences that belong in Oxfmt or Oxlint.
