# Obsidian 1.15.1 assessment — 16 November 2026

Source assessed: `f0e6e8537b14b1b4f98bb47017d42a0a144c0843`, plugin 0.1.4.

[Obsidian desktop 1.15.1](https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1/) changes startup, indexing and File Explorer performance. The plugin patches private adapter `reconcileDeletion` and uses internal reconciliation helpers. Their continued behavior requires a real host test; public release notes do not guarantee these internal interfaces.

Local checks passed on macOS: `npm ci --ignore-scripts`, `npm run lint`, and `npm test` (typecheck, production build, bundle smoke and serialized-adapter regression). The regression covers safe dotpaths, denylist, sidecar opt-in, queue progress, errors and disable cleanup, including overlapping enable/disable. The build SHA-256 was `dedce4c560db350f0bf301fdc2adecce90fcc67518f0ff1a58d6c838289d01cb`. These are test-double checks, not Obsidian 1.15.1 runtime evidence.

Actual allowed/forbidden paths, create/rename/delete and disable/recovery in the designated test vault remain unverified. No established background connection to a 1.15.1 host was available; the running application and existing fixtures/settings were left untouched. [Issue #3](https://github.com/viggomeesters/obsidian-minimal-hidden-files/issues/3) remains open. No version bump or release is justified by these local checks alone.

Dependency triage: the locked development tree reported 16 npm audit findings (three high, 13 moderate), including brace-expansion, fast-uri, js-yaml and the Obsidian SDK/Moment and lint-tool chains. `npm audit --omit=dev` reported none. These counts concern the build environment, not proof of shipped runtime exposure or safety. A trial of compatible automatic fixes reduced the count to 14 but refreshed unrelated peers/tooling and left findings; that lockfile change was discarded. Resolve the development advisories in a separately scoped toolchain update rather than force major upgrades during host compatibility work.
