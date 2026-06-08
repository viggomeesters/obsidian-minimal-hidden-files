# Security Policy

## Supported Versions

The current `0.1.x` line receives fixes while the plugin is under local testing.

## Reporting

Open a private report or issue on the repository if a bug exposes denied paths, corrupts vault state, or fails to restore Obsidian settings on disable.

## Security Notes

Minimal Hidden Files makes allowed hidden files visible in Obsidian's native File Explorer. It does not make files read-only. Obsidian or another installed plugin may allow editing, moving, deleting, or rendering those files.

The plugin excludes `.obsidian`, `.trash`, and `.git` by default.
