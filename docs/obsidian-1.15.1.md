# Obsidian 1.15.1 verification — 16 November 2026

Patch candidate: `0.1.5`.

A root-only scan skipped dotfiles beneath already cached folders after disable/re-enable. The scan now revisits loaded folders and drains pending parent/child reveals before completion. Runtime checks cover nested reveals, denylisted Git/trash paths, SQLite-sidecar opt-in/out through the settings handler, normal hidden-note opening, disable/re-enable, unload, configuration restoration and unchanged fixture bytes.

## Environment and checks

Tests use fictional fixtures in a separate synthetic vault on macOS arm64, the actual Obsidian 1.15.1 renderer and Electron 39.8.3. A bounded own bootstrap changes CLI socket ownership and test-window handling, with mock keychain enabled. The regular application, CLI endpoint and source files are protected and checked separately. The test window is allowed to be visible and remains unfocused; no OS mouse or keyboard input is used.

Local validation uses the checked-in lockfile with ordinary `npm ci`, TypeScript checking, production build, existing scripts and production dependency audit. The official `eslint-plugin-obsidianmd` 0.6.0 recommended configuration checks source, manifest, package metadata and license with zero errors or warnings. Its development dependencies are not shipped. The existing repository npm test suite passed.

## Scope limits

This establishes the exercised 1.15.1 desktop behavior. It does not establish mobile, minimum-version, native window resize, authentication or real keychain behavior. Viewer leaves are detached by the harness before unload; unregister/reload checks do not prove automatic closure of every open leaf. Public release, official Community review and fresh catalog installation are separate gates and are not claimed by a successful local build or screenshot.
