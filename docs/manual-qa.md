# Manual QA

## Test Vault

Recommended local vault:

```text
/Users/viggomeesters/Dev/obsidian-test-vault
```

## Fixture Setup

Create:

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

## Expected Results

- Allowed dotfiles and dotfolders appear in Obsidian's native File Explorer.
- Clicking visible files opens through Obsidian's normal middle-pane open flow.
- `.obsidian`, `.trash`, and `.git` remain hidden.
- Unsupported file types such as `.json`, `.yaml`, `.toml`, and `.env` appear when Obsidian can show them through its native unsupported-file setting.
- Disabling the plugin hides previously revealed paths and restores the previous unsupported-file setting.
