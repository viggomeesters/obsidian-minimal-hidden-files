# Contributing

Keep changes small and native to Obsidian's File Explorer behavior.

- Do not add a custom sidebar, tree browser, dashboard, or preview UI.
- Avoid runtime dependencies.
- Keep `.obsidian`, `.trash`, and `.git` excluded unless a future release documents and tests a different safety model.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before submitting changes.
