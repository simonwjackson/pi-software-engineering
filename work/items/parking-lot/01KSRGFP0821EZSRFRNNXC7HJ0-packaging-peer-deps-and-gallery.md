---
id: 01KSRGFP0821EZSRFRNNXC7HJ0
slug: packaging-peer-deps-and-gallery
title: Packaging fixes — peer-dep namespace migration and gallery card metadata
origin: parked
legacy: task-009
status: To Do
priority: low
labels:
  - packaging
  - cleanup
  - gallery
created: 2026-05-29
source: user
context:
---

# Packaging fixes — peer-dep namespace migration and gallery card metadata

## Context

Two small packaging fixes that share `package.json` as the file under edit:

- **Peer-dep namespace migration** (#43) — Pi's current canonical peer-dep names are `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`. This package still uses the legacy `@mariozechner/...` names (and `@sinclair/typebox` instead of bare `typebox`). The legacy names still resolve, but new packages should track the current names per Pi docs.
- **Gallery card metadata** (#44) — `pi.video` and `pi.image` are unset, so the package's card on pi.dev/gallery shows no preview. A video (mp4) takes precedence on hover; an image (png/jpeg/gif/webp) is the static fallback.

Reference: `~/.pi/docs/se-pi-upgrades.md` items #43, #44. Packaging conventions in `~/.pi/docs/pi-package-expert-guide.md` §2 and §11.

## Why it matters

- **Track current Pi conventions** — using current names avoids the next time the legacy names get deprecated.
- **Cleaner peer-dep declarations** — `typebox` is the documented current name; using `@sinclair/typebox` is an installation-quirk that shouldn't be load-bearing.
- **Discoverability** — a Pi gallery card without a preview is dead space. A short demo gif (or even a screenshot of `pi list` showing the SE skills) makes the package visible to people browsing.
- **One small PR** — both fixes touch `package.json`, can land together, no behaviour change.

## Acceptance Criteria

- [ ] `peerDependencies` and `peerDependenciesMeta` in `package.json` migrated to `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, and `typebox` (bare, not `@sinclair/typebox`).
- [ ] Any TypeScript imports referencing the legacy package names are updated in lockstep (extension `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"` → the new name). Audit `extensions/` for these.
- [ ] `npm install` from a clean state still succeeds and `npm run check` passes.
- [ ] A `pi.image` URL (and optionally `pi.video`) added under the `pi` block in `package.json`. Source asset committed under `docs/gallery/` so future regens are reproducible — or, if hosted off-repo, the URL is durable.
- [ ] The gallery card content is realistic SE work, not a logo — a short capture of `/se-work` running, `/se-status` (once it exists), or even a static screenshot of the skill list.
- [ ] README's screenshot/demo section (if it exists) uses the same asset for consistency.

## Related

- `package.json`
- `extensions/software-engineering.ts` (uses `@mariozechner/pi-coding-agent`)
- `extensions/se-loop/*.ts` (likely uses legacy names — audit)
- `docs/gallery/` (new, if hosting the gallery asset in-repo)
- `README.md`
- `~/.pi/docs/se-pi-upgrades.md` (items #43, #44)
- `~/.pi/docs/pi-package-expert-guide.md` (§2 minimum package.json, §11 gallery polish)

## Notes

Hold the gallery asset capture until at least one of the bigger-impact tasks (task-003 tool wrappers or task-004 control plane) has landed — capturing a demo of today's surface understates what the package will look like in a month. Migrate the peer-dep names now; do the gallery asset later.

If a video gif/mp4 turns out to be expensive to produce, ship the image first and let video be a follow-up. Gallery card with image-only is still much better than no preview.
