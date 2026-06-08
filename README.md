# Minimal Hidden Files

Minimal Hidden Files is a small desktop-only Obsidian plugin that reveals safe dotfiles and dotfolders in Obsidian's native File Explorer.

It does not add a sidebar, tree browser, preview panel, dashboard, or custom viewer. Files open through Obsidian's normal workspace flow in the middle pane.

## Features

- Shows allowed dotfiles such as `.gitignore`, `.env.example`, and `.mcp.json` in the native File Explorer.
- Shows allowed dotfolders such as `.claude/` and `.codex/` in the native File Explorer.
- Enables Obsidian's native unsupported-file visibility setting while active, so non-Markdown files can appear in the explorer.
- Restores the previous unsupported-file visibility setting when the plugin is disabled.
- Excludes `.obsidian`, `.trash`, and `.git` by default in v0.1.
- Uses no runtime dependencies and no custom file-management UI.

## Safety Model

Revealed files use Obsidian's normal file behavior. Depending on the file type and installed plugins, a revealed file may be viewable, editable, movable, deleted, or opened by another community plugin.

Minimal Hidden Files does not enforce read-only mode. Treat sensitive files like `.env` and tool configuration files with the same care you would use outside Obsidian.

The v0.1 denylist is intentionally hardcoded:

- `.obsidian` stays hidden to avoid exposing workspace, plugin, and vault configuration internals.
- `.trash` stays hidden because it is not useful for normal navigation.
- `.git` stays hidden because it is noisy, large, and easy to damage.

## Installation

### Manual Install

1. Build the plugin:

```bash
npm install
npm run build
```

2. Copy these files into `.obsidian/plugins/minimal-hidden-files/` inside a test vault:

```text
main.js
manifest.json
styles.css
```

3. Enable the plugin from Obsidian's Community Plugins settings.

## Testing Checklist

Create these paths in a test vault:

```text
.gitignore
.env.example
.mcp.json
.claude/commands/example.md
.codex/config.md
.obsidian/should-stay-hidden.md
.trash/should-stay-hidden.md
.git/should-stay-hidden
```

Expected result:

- `.gitignore`, `.env.example`, `.mcp.json`, `.claude/`, and `.codex/` appear in the native File Explorer.
- Clicking a visible file opens it through Obsidian's normal middle-pane file-open behavior.
- `.obsidian`, `.trash`, and `.git` stay hidden.
- Disabling the plugin hides revealed dotfiles/dotfolders and restores the previous unsupported-file setting.

## How It Works

Obsidian hides dot-prefixed files and folders during vault reconciliation. Minimal Hidden Files patches the desktop file-system adapter's internal `reconcileDeletion` method so allowed dot paths are registered instead of hidden. It then asks the adapter to rescan the vault.

Unsupported extensions are handled by Obsidian's own internal `vault.setConfig("showUnsupportedFiles", true)` setting.

These are internal Obsidian APIs. They keep the plugin minimal and native, but they may require maintenance if Obsidian changes its desktop adapter internals.

## Compatibility

- Desktop only.
- Tested against the local build toolchain with Obsidian API typings from npm.
- `minAppVersion`: 1.8.0.

## Attribution

Technical research for the native File Explorer hook included:

- [Show Hidden Files](https://github.com/witi42/obsidian-show-hidden-files)
- [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

This repository is an independent minimal implementation. No source files were copied from those projects.

## License

MIT
