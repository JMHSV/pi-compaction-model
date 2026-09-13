# Compact Request Retry

## Summary

Add automatic retry logic to the `compact()` call in the compaction model extension. The extension retries a failed compaction request up to 3 times with a 3-second delay between attempts, respecting the abort signal at every step.

## Motivation

Transient network errors or model provider hiccups can cause a single `compact()` call to fail, even though a retry moments later would succeed. Currently, any failure falls back immediately to Pi's active model. Retrying gives the dedicated model a fair chance before falling back.

## Requirements

1. The `compact()` call in `src/index.ts` SHALL attempt up to 3 times before falling back.
2. A failed attempt SHALL wait 3 seconds before the next attempt.
3. If `event.signal.aborted` becomes true during the wait, the retry loop SHALL exit immediately and return `undefined` (Pi fallback).
4. If `event.signal.aborted` is true at the start of the loop, the loop SHALL not attempt any compaction.
5. A successful attempt on any try SHALL skip remaining attempts and return the result.
6. After all 3 attempts fail, the extension SHALL log a warning that includes the attempt count and return `undefined`.

## Design

### Approach: Inline retry loop

The retry logic is a `for` loop wrapping the existing `compact()` call inside the `session_before_compact` event handler. No new files, no new abstractions.

### Changes to `src/index.ts`

Replace the current try/catch block (lines 66-93) with:

```typescript
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3_000;

restorePreviousFileOperations(event.preparation, event.branchEntries);

let result;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    result = await compact(
      event.preparation,
      model,
      auth.apiKey,
      auth.headers,
      event.customInstructions,
      event.signal,
      config.thinkingLevel,
      undefined,
      auth.env,
    );
    break;
  } catch (error) {
    if (event.signal.aborted || attempt === MAX_ATTEMPTS) {
      if (!event.signal.aborted) {
        warn(`Compaction with ${config.model} failed after ${MAX_ATTEMPTS} attempts; using Pi's active model.`, error);
      }
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, RETRY_DELAY_MS);
      event.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    if (event.signal.aborted) return;
  }
}

return { compaction: result };
```

Constants `MAX_ATTEMPTS` and `RETRY_DELAY_MS` are declared as local `const` bindings inside the handler, keeping them scoped and readable.

### No changes to `src/config.ts`

Retry parameters are hardcoded (3 attempts, 3s delay). They are not user-configurable. This avoids config schema changes, validation, docs updates, and test surface for values that don't need to change.

### No changes to public API

The extension's exported symbols remain unchanged. The retry is entirely internal to the event handler.

## Testing

The existing test suite covers config resolution and model reference parsing. The retry logic is in the event handler which depends on the Pi runtime (`compact()`, `ExtensionAPI`), making it unsuitable for unit tests without mocking the Pi internals.

Manual verification:
- Configure the extension with a model that intermittently fails.
- Observe that the extension retries up to 3 times before falling back.
- Cancel a compaction mid-retry and confirm the extension exits promptly.

## Out of Scope

- Configurable retry count or delay
- Exponential backoff
- Retry for non-compaction operations
- Logging per-attempt failures (only the final failure is logged)
