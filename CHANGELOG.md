# Changelog

## 0.1.3

- Removed the automatic full-vault hidden-file rescan from startup.
- Kept the adapter patch lightweight on load and added an explicit manual rescan command/settings button for large vaults.

## 0.1.2

- Remove the hardcoded `.obsidian` source-code string; the vault configuration folder is denied through `Vault.configDir`.
- Remove the optional dotfile-warning i18n patch to avoid unsafe `any` review warnings.

## 0.1.1

- Remove "Obsidian" from the manifest description for community review compliance.
- Use the native adapter `stat()` API instead of importing Node filesystem helpers.

## 0.1.0

- Initial minimal desktop-only plugin.
- Reveals allowed dotfiles and dotfolders in the native Obsidian File Explorer.
- Enables unsupported-file visibility while active.
- Excludes `.obsidian`, `.trash`, and `.git`.
