import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

let config: { model: string; reasons: string[]; thinkingLevel?: string } | null;
let compactImplementation: (...args: any[]) => Promise<any>;

mock.module("@earendil-works/pi-coding-agent", () => ({
  compact: (...args: any[]) => compactImplementation(...args),
}));

mock.module("../src/config.js", () => ({
  COMPACTION_REASONS: ["manual", "threshold", "overflow"],
  THINKING_LEVELS: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  loadConfig: () => config,
  parseModelReference: (reference: string) => {
    const separator = reference.indexOf("/");
    if (separator <= 0 || separator === reference.length - 1) return null;
    return { provider: reference.slice(0, separator), modelId: reference.slice(separator + 1) };
  },
  resolveConfig: () => null,
}));

let compactionModel: any;

beforeAll(async () => {
  compactionModel = (await import("../src/index.js")).default;
});

beforeEach(() => {
  config = { model: "provider/model", reasons: ["manual", "threshold", "overflow"] };
  compactImplementation = async () => ({ summary: "compacted" });
});

function harness(options: {
  reason?: string;
  findModel?: boolean;
  auth?: { ok: boolean; error?: string };
} = {}) {
  let handler: any;
  const model = { provider: "provider", id: "model" };
  const preparation = {
    fileOps: {
      read: new Set(["current-read.ts"]),
      edited: new Set(["current-edit.ts"]),
    },
  };
  const event = {
    reason: options.reason ?? "manual",
    preparation,
    branchEntries: [
      {
        type: "compaction",
        details: {
          readFiles: ["previous-read.ts", "previous-read.ts", "current-read.ts"],
          modifiedFiles: ["previous-edit.ts", "previous-edit.ts", "current-edit.ts"],
        },
      },
    ],
    customInstructions: undefined,
    signal: new AbortController().signal,
  };
  const ctx = {
    modelRegistry: {
      find: () => options.findModel === false ? undefined : model,
      getApiKeyAndHeaders: async () => options.auth ?? { ok: true, apiKey: "key" },
    },
  };
  compactionModel({ on: (_name: string, registered: any) => { handler = registered; } });
  return { handler, event, ctx, preparation, model };
}

function expectRestored(preparation: { fileOps: { read: Set<string>; edited: Set<string> } }): void {
  expect([...preparation.fileOps.read]).toEqual(["current-read.ts", "previous-read.ts"]);
  expect([...preparation.fileOps.edited]).toEqual(["current-edit.ts", "previous-edit.ts"]);
}

describe("session_before_compact", () => {
  test("restores previous file operations before excluded-reason fallback", async () => {
    config = { model: "provider/model", reasons: ["manual"] };
    const state = harness({ reason: "threshold" });

    expect(await state.handler(state.event, state.ctx)).toBeUndefined();
    expectRestored(state.preparation);
  });

  test("restores previous file operations before model lookup fallback", async () => {
    const state = harness({ findModel: false });

    expect(await state.handler(state.event, state.ctx)).toBeUndefined();
    expectRestored(state.preparation);
  });

  test("restores previous file operations before authentication fallback", async () => {
    const state = harness({ auth: { ok: false, error: "missing credentials" } });

    expect(await state.handler(state.event, state.ctx)).toBeUndefined();
    expectRestored(state.preparation);
  });

  test("passes restored, deduplicated file operations to the dedicated model", async () => {
    const state = harness();
    let compactPreparation: unknown;
    compactImplementation = async (preparation) => {
      compactPreparation = preparation;
      return { summary: "dedicated" };
    };

    expect(await state.handler(state.event, state.ctx)).toEqual({
      compaction: { summary: "dedicated" },
    });
    expect(compactPreparation).toBe(state.preparation);
    expectRestored(state.preparation);
  });

  test("keeps restored file operations when dedicated compaction throws", async () => {
    const state = harness();
    compactImplementation = async (preparation) => {
      expectRestored(preparation);
      throw new Error("provider failed");
    };

    expect(await state.handler(state.event, state.ctx)).toBeUndefined();
    expectRestored(state.preparation);
  });
});
