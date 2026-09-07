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

describe("multi-room config", () => {
  const savedRooms = Array.from({ length: 6 }, (_, index) => ({
    id: `room-${index + 1}`,
    roomId: String(index + 1),
    displayName: `房间 ${index + 1}`,
    groupId: "uncategorized",
    updatedAt: "2026-08-27T00:00:00.000Z",
  }));

  it("defaults old configs without selecting or auto-targeting a room", () => {
    const merged = mergeAppConfig({ savedRooms });
    expect(merged.selectedSavedRoomIds).toEqual([]);
    expect(merged.send.lastRoomId).toBeUndefined();
  });

  it("deduplicates, drops orphan ids and keeps the first five selections", () => {
    const merged = mergeAppConfig({
      savedRooms,
      selectedSavedRoomIds: [
        "room-1", "room-1", "missing", "room-2",
        "room-3", "room-4", "room-5", "room-6",
      ],
      send: { lastRoomId: "123456" },
    });
    expect(merged.selectedSavedRoomIds).toEqual([
      "room-1", "room-2", "room-3", "room-4", "room-5",
    ]);
    expect(merged.send.lastRoomId).toBe("123456");
  });

  it("drops empty saved-room selections while preserving deduplication and the five-room cap", () => {
    const malformedRooms = [
      { ...savedRooms[0], id: "" },
      { ...savedRooms[0], id: "   " },
      ...savedRooms,
    ];
    const merged = mergeAppConfig({
      savedRooms: malformedRooms,
      selectedSavedRoomIds: [
        "", "   ", "room-1", "room-1", "room-2",
        "room-3", "room-4", "room-5", "room-6",
      ],
    });

    expect(merged.selectedSavedRoomIds).toEqual([
      "room-1", "room-2", "room-3", "room-4", "room-5",
    ]);
  });

  it.each(["", "0", "-1", "1.5", "1e3", "abc"])(
    "drops invalid last send room %s",
    (lastRoomId) => {
      expect(mergeAppConfig({ send: { lastRoomId } }).send.lastRoomId)
        .toBeUndefined();
    },
  );
});
