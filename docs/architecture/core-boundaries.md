# Core boundaries

`@emi/core` is the reusable chat platform. It owns generic contracts, actor-backed runtime
behavior, generic React views, and the platform adapters needed to make those contracts usable.
Applications compose the core; they do not copy its generic implementation.

## What belongs in core

Core owns these reusable capabilities behind named subpaths:

- provider-neutral chat protocol, schemas, errors, commands, and extension contracts;
- actor-backed runtime, transport lifecycle, queueing, attachments, thread presentation, and
  viewport policy;
- generic React providers, controlled primitives, and styled chat recipes;
- Effect server ports and use cases;
- browser adapters for storage, broadcast channels, fetch, online state, and other injected web
  capabilities;
- AI SDK adapters that translate provider/UI message streams into the core protocol;
- Cloudflare adapters for D1, Workers, R2, auth, and route composition; and
- deterministic testing adapters and actor harnesses.

The adapter rule is about ownership, not dependency purity. Platform-specific code is allowed in
core when it is a reusable, injected adapter with a named boundary. Platform-specific details must
not leak into the provider-neutral protocol, common runtime contracts, or generic server ports.

## What stays in a flavor or application

HealthFit remains a composition over core. Hevy, Discord product workflows, privacy and ingest
policy, notes, HealthFit analytics, fitness tools, prompts, renderers, and product pages stay in
`packages/flavor-healthfit` or the owning app. They may depend on core contracts and contribute
namespaced behavior; core must not import them.

An application owns deployment configuration, product authentication policy, route wiring, and
the concrete adapters that bind HealthFit services. It should not duplicate a generic browser,
AI SDK, Cloudflare, chat, attachment, or viewport implementation already exposed by core.

## Boundary review

For every proposed move, ask:

1. Does the behavior describe chat or agent infrastructure without HealthFit vocabulary? If yes,
   it is a core candidate.
2. Is it an implementation of a browser, AI SDK, or Cloudflare capability behind an injected
   interface? If yes, it belongs in a core adapter subpath.
3. Does it encode a product route, table, prompt, tool, renderer, or policy? If yes, keep it in a
   flavor or app package.
4. Does the public boundary expose raw platform types where a generic contract should be used? If
   yes, move the mapping to the adapter edge.

The public package map in [`core-api.md`](../core-api.md) is the contract. Internal file location
may change, but the curated subpath and its tests must remain stable.
