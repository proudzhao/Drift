import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG, mergeAppConfig } from "./config";

describe("recording config", () => {
  it("defaults recording to disabled", () => {
    expect(DEFAULT_APP_CONFIG.recording.enabled).toBe(false);
  });

  it("preserves an explicitly enabled recording config", () => {
    expect(
      mergeAppConfig({ recording: { enabled: true } }).recording.enabled,
    ).toBe(true);
  });
});

describe("UI theme config", () => {
  it("defaults legacy and invalid UI themes to dark", () => {
    expect(DEFAULT_APP_CONFIG.appearance.theme).toBe("dark");
    expect(
      mergeAppConfig({ appearance: { theme: "invalid" } as never }).appearance
        .theme,
    ).toBe("dark");
  });

  it("preserves an explicit light UI theme", () => {
    expect(
      mergeAppConfig({
        appearance: {
          ...DEFAULT_APP_CONFIG.appearance,
          theme: "light",
        },
      }).appearance.theme,
    ).toBe("light");
  });
});

describe("message flow config", () => {
  it("keeps legacy and invalid values on safe defaults", () => {
    expect(DEFAULT_APP_CONFIG.appearance.messageFlow).toBe("horizontal");
    expect(DEFAULT_APP_CONFIG.appearance.verticalOverflowPolicy).toBe("realtime");
    const merged = mergeAppConfig({
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "diagonal",
        verticalOverflowPolicy: "unbounded",
      } as never,
    });
    expect(merged.appearance.messageFlow).toBe("horizontal");
    expect(merged.appearance.verticalOverflowPolicy).toBe("realtime");
  });

  it("preserves explicit vertical complete mode", () => {
    const merged = mergeAppConfig({
      appearance: {
        ...DEFAULT_APP_CONFIG.appearance,
        messageFlow: "vertical",
        verticalOverflowPolicy: "complete",
      },
    });
    expect(merged.appearance.messageFlow).toBe("vertical");
    expect(merged.appearance.verticalOverflowPolicy).toBe("complete");
  });
});
