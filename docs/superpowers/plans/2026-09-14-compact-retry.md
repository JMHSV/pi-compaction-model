# Compact Request Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the `compact()` call in a retry loop that attempts 3 times with a 3-second abortable delay between attempts.

**Architecture:** Single inline change in `src/index.ts` — replace the existing try/catch block with a for-loop that retries on failure, sleeps abortably between attempts, and falls back to Pi's active model after exhausting retries.

**Tech Stack:** TypeScript, Bun

---

### Task 1: Add retry loop to compaction handler

**Files:**
- Modify: `src/index.ts:66-93`

- [ ] **Step 1: Replace the try/catch block with the retry loop**

In `src/index.ts`, replace the entire `try { ... } catch (error) { ... }` block (lines 66–93) with the following code. The `restorePreviousFileOperations` call at line 73 moves above the loop since it only needs to run once.

```typescript
      restorePreviousFileOperations(event.preparation, event.branchEntries);

      const MAX_ATTEMPTS = 3;
      const RETRY_DELAY_MS = 3_000;

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
              warn(
                `Compaction with ${config.model} failed after ${MAX_ATTEMPTS} attempts; using Pi's active model.`,
                error,
              );
            }
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, RETRY_DELAY_MS);
            event.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          if (event.signal.aborted) return;
        }
      }

      return { compaction: result };
```

After this edit, the full event handler (from the `pi.on("session_before_compact"` line through the closing `})`) should read:

```typescript
  pi.on("session_before_compact", async (event, ctx) => {
    const config = loadConfig(ctx);
    if (!config || !config.reasons.includes(event.reason)) return;

    const reference = parseModelReference(config.model);
    if (!reference) {
      warn(`Invalid model '${config.model}'; expected provider/model. Using Pi's active model.`);
      return;
    }

    const model = ctx.modelRegistry.find(reference.provider, reference.modelId);
    if (!model) {
      warn(`Model not found: ${config.model}. Using Pi's active model.`);
      return;
    }

    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) {
        warn(`Authentication failed for ${config.model}: ${auth.error}. Using Pi's active model.`);
        return;
      }

      restorePreviousFileOperations(event.preparation, event.branchEntries);

      const MAX_ATTEMPTS = 3;
      const RETRY_DELAY_MS = 3_000;

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
              warn(
                `Compaction with ${config.model} failed after ${MAX_ATTEMPTS} attempts; using Pi's active model.`,
                error,
              );
            }
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, RETRY_DELAY_MS);
            event.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          if (event.signal.aborted) return;
        }
      }

      return { compaction: result };
    } catch (error) {
      if (!event.signal.aborted) {
        warn(`Compaction with ${config.model} failed; using Pi's active model.`, error);
      }
      return;
    }
  });
```

Note: the outer `try/catch` around `getApiKeyAndHeaders` remains — it handles auth failures, which are not retried.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Run existing tests**

Run: `bun run test`
Expected: All tests pass (tests cover config resolution and model parsing, not the handler — this confirms no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: retry compact request up to 3 times with 3s delay"
```
