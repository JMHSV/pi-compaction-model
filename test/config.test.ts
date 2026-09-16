import { describe, expect, test } from "bun:test";
import {
  COMPACTION_REASONS,
  isInstallTelemetryEnabled,
  parseModelReference,
  resolveConfig,
} from "../src/config.js";

describe("resolveConfig", () => {
  test("returns null when unconfigured", () => {
    expect(resolveConfig({}, {})).toBeNull();
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

describe("isInstallTelemetryEnabled", () => {
  const settings = (enabled: boolean) => ({
    getEnableInstallTelemetry: () => enabled,
  });

  test("falls back to the settings value when PI_TELEMETRY is unset", () => {
    expect(isInstallTelemetryEnabled(settings(true), undefined)).toBe(true);
    expect(isInstallTelemetryEnabled(settings(false), undefined)).toBe(false);
  });

  test("truthy PI_TELEMETRY values enable telemetry", () => {
    for (const value of ["1", "true", "TRUE", "yes", "Yes"]) {
      expect(isInstallTelemetryEnabled(settings(false), value)).toBe(true);
    }
  });

  test("other PI_TELEMETRY values disable telemetry", () => {
    for (const value of ["0", "false", "no", ""]) {
      expect(isInstallTelemetryEnabled(settings(true), value)).toBe(false);
    }
  });
});
