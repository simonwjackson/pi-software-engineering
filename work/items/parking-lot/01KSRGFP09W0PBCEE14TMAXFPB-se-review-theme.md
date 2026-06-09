---
id: 01KSRGFP09W0PBCEE14TMAXFPB
slug: se-review-theme
title: Ship an `se-review` theme tuned for review/finding readability
origin: parked
legacy: task-010
status: To Do
priority: low
labels:
  - theme
  - ux
  - review
  - optional
created: 2026-05-29
source: user
context:
---

# Ship an `se-review` theme tuned for review/finding readability

## Context

Pi themes are JSON colour files with 51 required tokens. They're cheap to ship (one file under `themes/` and a `pi.themes` entry in `package.json`) and they hot-reload while editing.

`se-code-review` and `se-doc-review` produce a lot of text the user has to skim: severity-tagged findings, `file:line` references, diff fragments, persona tags. A theme tuned for this kind of output — distinctive `mdHeading` for severity, strong `toolDiffAdded`/`toolDiffRemoved` contrast, clear `mdLink`/`mdLinkUrl` for `file:line` references — makes the review surface much more scannable.

Reference: `~/.pi/docs/se-pi-upgrades.md` item #42. Theme schema and required tokens in `~/.pi/docs/pi-package-expert-guide.md` §7.

This is genuinely optional. Some users prefer their own theme and would never switch. The package can ship it without forcing it — the user opts in via `/settings` or `"theme": "se-review"` in `settings.json`.

## Why it matters

- **Review readability is a real UX problem** — fan-out reviews produce a lot of dense markdown; theming directly attacks scannability.
- **Low effort, low risk** — single JSON file, no code, no test surface.
- **Showcases what's possible** — if other Pi packages start shipping themes for their flows, `se-review` is a useful prior art example.

## Acceptance Criteria

- [ ] `themes/se-review.json` defines all 51 required tokens, validated against the published `$schema` URL.
- [ ] `pi.themes` in `package.json` includes `./themes` so the theme ships in the npm tarball.
- [ ] Theme tested against actual output from `se-code-review` and `se-doc-review` — at least the finding format from `references/review-output-template.md` rendered in the terminal under both light and dark base modes.
- [ ] Theme name in the JSON (`"name": "se-review"`) matches the file's load identifier so `"theme": "se-review"` in settings.json works.
- [ ] README mentions the theme exists and how to opt in, without recommending it as a default.
- [ ] Theme works under truecolor and 256-colour terminals; degrades reasonably under 16-colour (using 256-palette indices where critical, falling back to bold/underline where colour can't carry meaning alone).

## Related

- `themes/` (new)
- `package.json` (`pi.themes`)
- `skills/se-code-review/references/review-output-template.md`
- `skills/se-doc-review/references/review-output-template.md`
- `README.md`
- `~/.pi/docs/se-pi-upgrades.md` (item #42)
- `~/.pi/docs/pi-package-expert-guide.md` (§7 themes)

## Notes

This is the lowest-priority item in the current backlog. Land last, or skip entirely if no one asks for it after the rest of the upgrades ship.

If during design the theme starts wanting to vary per-severity colours dynamically (e.g. critical=red, advisory=yellow), that's a sign the review surface needs custom message renderers (`~/.pi/docs/se-pi-upgrades.md` #36) more than it needs a theme. Don't try to solve renderer problems with theme tokens — the theme is for static colour choices, not data-driven ones.
