# Core and flavor architecture implementation session prompt

Implement `plans/core-flavor-architecture.md` as one staged extraction task. Read `AGENTS.md`, the full
plan, workspace package graph, and current API/chat composition before editing anything.

First verify the plan's ownership prerequisite. If it is incomplete, implement only extraction work
that cannot weaken or bypass ownership and clearly leave dependent phases pending. Keep the existing app
deployable after every revision.

Follow the plan's dependency direction: contracts, core server ports/services, Cloudflare adapters,
core web shell, then the HealthFit flavor and composition roots. Split oversized Worker/database files
at real route, repository, and domain boundaries as part of the extraction. Do not copy source into a
template, add dynamic plugin loading, leak platform types into contracts, or invent an abstraction that
only one consumer needs.

Add contract, ownership-isolation, composition, local-development, and Cloudflare deployment tests.
Keep behavior stable until a phase explicitly moves flavor behavior. Use multiple coherent JJ revisions,
ideally one per extraction phase, and update the plan after each completed phase. Run repository checks
from `AGENTS.md`. Finish with the package dependency graph, revision ids, verified deployment paths, and
any phase blocked by an unmet prerequisite.
