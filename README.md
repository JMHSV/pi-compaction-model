# pi-compaction-model

A minimal extension for [Pi Coding Agent](https://github.com/earendil-works/pi) that lets native compaction use a dedicated model and thinking level.

It does not introduce a new summarization pipeline. It calls Pi's exported `compact()` implementation with the configured model, preserving Pi's native:

- prompts and structured summary format
- cut-point and recent-message retention behavior
- iterative previous-summary updates
- split-turn summaries
- file-operation tracking
- output-token budgeting
- `/compact` focus instructions

If the configured model is unavailable or fails, the extension returns control to Pi, which compacts with the active conversation model.

## Install

From npm:

```bash
pi install npm:pi-compaction-model
```

Or directly from GitHub:

```bash
pi install git:github.com/JMHSV/pi-compaction-model
```

You can also clone it and add `local/pi-compaction-model` to `~/.pi/agent/settings.json`.

Restart Pi after installation, or use `/reload`.

## Configure

Add `compactionModel` to `~/.pi/agent/settings.json`:

```json
{
  "compactionModel": {
    "model": "openai-codex/gpt-5.6-terra",
    "thinkingLevel": "medium"
  }
}
```

Set `model` to a model known to Pi in `provider/model` form, or use `"default"` (or omit `model`) to dynamically use the session's active model at compaction time. This follows model changes during the session while still applying `thinkingLevel` and `reasons`.

For example, to use the active model with a dedicated compaction thinking level:

```json
{
  "compactionModel": {
    "model": "default",
    "thinkingLevel": "medium"
  }
}
```

If `compactionModel` itself is absent, the extension leaves compaction to Pi as usual.

Supported thinking levels are:

```text
off, minimal, low, medium, high, xhigh, max
```

Omit `thinkingLevel` to use the provider default.

### Select which compactions to route

By default the configured model handles all native compaction reasons:

- `manual` — `/compact`
- `threshold` — automatic context-threshold compaction
- `overflow` — overflow recovery before retry

Use `reasons` to handle only a subset:

```json
{
  "compactionModel": {
    "model": "google/gemini-2.5-flash",
    "thinkingLevel": "low",
    "reasons": ["threshold", "overflow"]
  }
}
```

An empty `reasons` array disables routing without removing the configuration. You can also use `"enabled": false`, or set `"compactionModel": false` in trusted project settings.

### Project overrides

A trusted project's `.pi/settings.json` can override individual global fields:

```json
{
  "compactionModel": {
    "model": "anthropic/claude-sonnet-4-5"
  }
}
```

Project fields are shallow-merged over the global `compactionModel` object. Untrusted project settings are ignored.

## Coexisting with other compaction extensions

Multiple extensions can handle `session_before_compact`, and the last extension that returns a compaction result wins. Avoid configuring two extensions for the same reason.

For example, to use Smart Compact manually and this extension only for automatic native compaction:

```json
{
  "smartCompact": {
    "autoTrigger": false
  },
  "compactionModel": {
    "model": "openai-codex/gpt-5.6-terra",
    "thinkingLevel": "medium",
    "reasons": ["threshold", "overflow"]
  }
}
```

The resulting routing is:

| Event | Handler |
|---|---|
| `/smart-compact` | Smart Compact |
| `/compact` | Pi native compaction with the active model |
| Automatic threshold | Pi native compaction algorithm with the configured model |
| Overflow recovery | Pi native compaction algorithm with the configured model |
| Configured-model failure | Pi native fallback with the active model |

## Failure behavior

The extension logs a warning and falls back to Pi's active model when:

- the configuration is invalid
- the model cannot be found
- authentication cannot be resolved
- the compaction request fails or is cancelled

Pi currently resolves authentication for the active conversation model before firing the compaction extension hook. Consequently, the active model must also have valid authentication even when a dedicated compaction model is configured.

## Development

```bash
bun install
bun run check
```

## License

MIT
