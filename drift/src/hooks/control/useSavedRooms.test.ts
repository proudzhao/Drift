import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEFAULT_APP_CONFIG, type AppConfig } from "../../types/config";
import type { AppConfigUpdater } from "./useControlConfig";
import { useSavedRooms } from "./useSavedRooms";

test("saving a temporary room does not select it", async () => {
  const config: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    selectedSavedRoomIds: ["existing"],
  };
  const saveConfig = vi.fn(async (_updater: AppConfigUpdater) => undefined);
  const { result } = renderHook(() =>
    useSavedRooms({
      config,
      draftRoomId: "",
      saveConfig,
    }),
  );

  await act(() => result.current.saveRoom("9", "临时主播"));

  const updater = saveConfig.mock.calls[0][0];
  const next = updater(config);
  expect(next.savedRooms[0]).toMatchObject({
    roomId: "9",
    displayName: "临时主播",
    anchorName: "临时主播",
  });
  expect(next.selectedSavedRoomIds).toEqual(["existing"]);
});
