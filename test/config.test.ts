import { describe, expect, test } from "bun:test";
import {
  COMPACTION_REASONS,
  parseModelReference,
  resolveConfig,
} from "../src/config.js";

describe("resolveConfig", () => {
  test("returns null when unconfigured", () => {
    expect(resolveConfig({}, {})).toBeNull();
  });

  test.each([{}, { model: "default" }, { model: " default " }])(
    "uses the active session model for %j",
    (modelConfig) => {
      const warnings: string[] = [];
      expect(
        resolveConfig(
          { compactionModel: { ...modelConfig, thinkingLevel: "high", reasons: ["manual"] } },
          {},
          (message) => warnings.push(message),
        ),
      ).toEqual({ model: "default", thinkingLevel: "high", reasons: ["manual"] });
      expect(warnings).toHaveLength(0);
    },
  );

  test("project default overrides a hard-coded global model", () => {
    expect(
      resolveConfig(
        { compactionModel: { model: "provider/base", thinkingLevel: "low" } },
        { compactionModel: { model: "default" } },
      ),
    ).toEqual({ model: "default", thinkingLevel: "low", reasons: [...COMPACTION_REASONS] });
  });

  test.each([null, "", "   ", 42])("rejects invalid model %j", (model) => {
    const warnings: string[] = [];
    expect(resolveConfig({ compactionModel: { model } }, {}, (message) => warnings.push(message))).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  test("defaults to every compaction reason", () => {
    expect(
      resolveConfig({ compactionModel: { model: "provider/model" } }, {}),
    ).toEqual({
      model: "provider/model",
      thinkingLevel: undefined,
      reasons: [...COMPACTION_REASONS],
    });
  });

  test("merges trusted project overrides", () => {
    expect(
      resolveConfig(
        {
          compactionModel: {
            model: "provider/base",
            thinkingLevel: "low",
            reasons: ["manual"],
          },
        },
        {
          compactionModel: {
            model: "provider/project",
            reasons: ["threshold", "overflow"],
          },
        },
      ),
    ).toEqual({
      model: "provider/project",
      thinkingLevel: "low",
      reasons: ["threshold", "overflow"],
    });
  });

  test("can be disabled globally or per project", () => {
    expect(resolveConfig({ compactionModel: false }, {})).toBeNull();
    expect(
      resolveConfig({ compactionModel: { model: "provider/model" } }, { compactionModel: false }),
    ).toBeNull();
  });

  test("falls back safely for invalid optional settings", () => {
    const warnings: string[] = [];
    const config = resolveConfig(
      {
        compactionModel: {
          model: "provider/model",
          thinkingLevel: "extreme",
          reasons: ["threshold", "other"],
        },
      },
      {},
      (message) => warnings.push(message),
    );

    expect(config).toEqual({
      model: "provider/model",
      thinkingLevel: undefined,
      reasons: [...COMPACTION_REASONS],
    });
    expect(warnings).toHaveLength(2);
  });
});

describe("parseModelReference", () => {
  test("splits only the provider prefix", () => {
    expect(parseModelReference("openrouter/vendor/model")).toEqual({
      provider: "openrouter",
      modelId: "vendor/model",
    });
  });

  test("rejects malformed references", () => {
    expect(parseModelReference("model-only")).toBeNull();
    expect(parseModelReference("/model")).toBeNull();
    expect(parseModelReference("provider/")).toBeNull();
  });
});
