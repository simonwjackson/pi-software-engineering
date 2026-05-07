---
name: architecture-improvement
description: Find deepening opportunities in a codebase using project context, established domain language, documented decisions, and public-contract test posture. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and agent-navigable.
---

# Architecture Improvement

Surface architectural friction and propose **deepening opportunities**: refactors that put meaningful behavior behind small, stable interfaces. The aim is better locality, leverage, public-contract tests, and agent-navigability.

## Architecture language

Use these terms consistently, while preserving the project's established domain language.

- **Module** — anything with an interface and an implementation: function, class, package, feature slice, command, route, component, or service.
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, configuration, and operational expectations. Not just the type signature.
- **Implementation** — the code inside the module.
- **Depth** — leverage at the interface: a lot of behavior behind a small interface. **Deep** means high leverage. **Shallow** means the interface is nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behavior can be altered without editing callers.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers gain from depth.
- **Locality** — what maintainers gain from depth: change, bugs, and knowledge concentrated in one place.

Key principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across many callers, it was earning its keep.
- **The interface is the test surface**: tests should verify externally observable behavior through public contracts, not private implementation shape.
- **One adapter = hypothetical seam. Two adapters = real seam**: avoid abstractions that only name a possibility unless the name meaningfully reduces cognitive load.
- **Shared language protects seams**: domain terms should come from project docs and code, not from new synonyms invented during the review.
- **Decision rationale belongs in durable docs** when it explains a non-obvious architectural trade-off.

## Process

### 1. Explore project context

Read relevant project instruction files first. Then look for domain, product, planning, feature, architecture, and learning docs that apply to the area being reviewed. Common places include project instruction files, README files, docs trees, plans, requirements, feature briefs, architecture notes, and `docs/solutions/` when present.

Do not require a fixed glossary file or a fixed decision-record path. Use whatever documentation shape the project has established. If the documentation is missing or inconsistent, note that as a finding instead of inventing a new global doc convention.

Explore the codebase organically and note where you experience friction:

- Where does understanding one domain concept require bouncing between many small modules?
- Where are modules **shallow**: interface nearly as complex as implementation?
- Where have pure functions been extracted only for testability while real bugs hide in orchestration?
- Where do tightly-coupled modules leak implementation details across seams?
- Which public contracts are hard to test without coupling to internals?
- Which terms in code and docs drift away from the project's established language?
- Which prior decisions or solution docs should constrain or inform the recommendation?

Apply the **deletion test** to suspected shallow modules. A module earns its name when deleting it would spread complexity across callers.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate include:

- **Files** — files/modules involved
- **Problem** — why the current architecture causes friction
- **Proposed change** — plain-English description of what would change
- **Benefits** — locality, leverage, public-contract testability, and reduced cognitive load
- **Decision context** — existing docs/decisions that support or constrain it, if any
- **Documentation need** — whether a durable rationale or terminology update should be added, and where it likely belongs in this project

Use the project's established domain terms. If a term is unclear, call that out and ask for clarification rather than substituting a synonym.

Do not propose detailed interfaces yet. Ask: "Which of these would you like to explore?"

### 3. Deepen one candidate

Once the user picks a candidate, walk the design tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, which callers keep the same public contract, and which tests survive.

Ask one focused question at a time. If a question can be answered by reading code or docs, read them instead of asking.

When decisions crystallize:

- If a new or sharpened domain term is needed, propose where it should be documented according to the project's existing doc shape. Do not silently write docs unless requested.
- If the user rejects a candidate for a load-bearing reason, offer to record the rationale in the project's durable decision documentation. Only offer when the reason would help future maintainers avoid re-litigating the same option.
- If the design needs interface alternatives, use [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md) as supporting guidance.
