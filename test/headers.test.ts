import { describe, expect, test } from "bun:test";
import { withOpenRouterAttribution } from "../src/index.js";

const ATTRIBUTION = {
  "HTTP-Referer": "https://pi.dev",
  "X-OpenRouter-Title": "pi",
  "X-OpenRouter-Categories": "cli-agent",
};

const openRouterModel = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
};

const otherModel = { provider: "anthropic", baseUrl: "https://api.anthropic.com" };

describe("withOpenRouterAttribution", () => {
  test("adds pi's app attribution for OpenRouter models", () => {
    expect(withOpenRouterAttribution(openRouterModel, true, undefined)).toEqual(
      ATTRIBUTION,
    );
  });

  test("detects OpenRouter via baseUrl for custom providers", () => {
    const model = { provider: "my-proxy", baseUrl: "https://openrouter.ai/api/v1" };
    expect(withOpenRouterAttribution(model, true, undefined)).toEqual(ATTRIBUTION);
  });

  test("leaves non-OpenRouter models untouched", () => {
    const headers = { Authorization: "Bearer x" };
    expect(withOpenRouterAttribution(otherModel, true, headers)).toBe(headers);
  });

  test("sends no attribution when telemetry is disabled", () => {
    const headers = { Authorization: "Bearer x" };
    expect(withOpenRouterAttribution(openRouterModel, false, headers)).toBe(headers);
  });

  test("lets caller-provided headers take precedence", () => {
    expect(
      withOpenRouterAttribution(openRouterModel, true, {
        "HTTP-Referer": "https://example.com",
        "X-Custom": "yes",
      }),
    ).toEqual({
      "HTTP-Referer": "https://example.com",
      "X-OpenRouter-Title": "pi",
      "X-OpenRouter-Categories": "cli-agent",
      "X-Custom": "yes",
    });
  });
});
