import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultShortcutLabel,
  type AppConfig,
  type AppearanceConfig,
  type FilterConfig,
  type SavedRoom,
} from "../../types/config";
import type { DanmakuStatus } from "../../types/danmaku";
import { DiagnosticsSettings, type ApiTestStep } from "./DiagnosticsSettings";
import { DisplaySettings } from "./DisplaySettings";
import { FilterSettings } from "./FilterSettings";
import { RoomSettings } from "./RoomSettings";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ShortcutSettings } from "./ShortcutSettings";
import type { EditingSavedRoom } from "./SavedRoomList";

type ControlPanelProps = {
  config: AppConfig;
  isConnected: boolean;
  onConfigChange: (config: AppConfig) => void;
  onStatusChange: (status: DanmakuStatus) => void;
  status: DanmakuStatus;
};

export function ControlPanel({
  config,
  isConnected,
  onConfigChange,
  onStatusChange,
  status,
}: ControlPanelProps) {
  const [draftRoomId, setDraftRoomId] = useState(config.roomId);
  const [draftShortcut, setDraftShortcut] = useState(
    config.shortcuts.toggleEditMode,
  );
  const [draftBlockedWords, setDraftBlockedWords] = useState(
    config.filter.blockedWords.join("\n"),
  );
  const [shortcutError, setShortcutError] = useState("");
  const [apiTestSteps, setApiTestSteps] = useState<ApiTestStep[]>([]);
  const [apiTestError, setApiTestError] = useState("");
  const [isApiTesting, setIsApiTesting] = useState(false);
  const [expandedApiStepKey, setExpandedApiStepKey] = useState<string | null>(
    null,
  );
  const [editingSavedRoom, setEditingSavedRoom] =
    useState<EditingSavedRoom | null>(null);
  const [savedRoomError, setSavedRoomError] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("room");

  useEffect(() => {
    setDraftRoomId(config.roomId);
  }, [config.roomId]);

  useEffect(() => {
    setDraftShortcut(config.shortcuts.toggleEditMode);
  }, [config.shortcuts.toggleEditMode]);

  useEffect(() => {
    setDraftBlockedWords(config.filter.blockedWords.join("\n"));
  }, [config.filter.blockedWords]);

  async function saveConfig(nextConfig: AppConfig) {
    const savedConfig = await invoke<AppConfig>("save_app_config", {
      config: nextConfig,
    });
    onConfigChange(savedConfig);
  }

  async function updateAppearance(nextAppearance: Partial<AppearanceConfig>) {
    await saveConfig({
      ...config,
      appearance: {
        ...config.appearance,
        ...nextAppearance,
      },
    });
  }

  async function updateFilter(nextFilter: Partial<FilterConfig>) {
    await saveConfig({
      ...config,
      filter: {
        ...config.filter,
        ...nextFilter,
      },
    });
  }

  async function saveBlockedWords() {
    await updateFilter({
      blockedWords: draftBlockedWords
        .split("\n")
        .map((word) => word.trim())
        .filter(Boolean),
    });
  }

  async function saveRooms(savedRooms: SavedRoom[]) {
    await saveConfig({
      ...config,
      savedRooms,
    });
  }

  async function saveCurrentRoom() {
    const roomId = draftRoomId.trim();
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }

    setSavedRoomError("");
    const now = new Date().toISOString();
    const roomName = status.anchorName?.trim();
    const displayName =
      roomName && roomName !== "未知" ? roomName : `房间 ${roomId}`;
    const existingRoom = config.savedRooms.find((room) => room.roomId === roomId);
    const savedRooms = existingRoom
      ? config.savedRooms.map((room) =>
          room.id === existingRoom.id
            ? {
                ...room,
                anchorName: roomName || room.anchorName,
                displayName: room.displayName || displayName,
                updatedAt: now,
              }
            : room,
        )
      : [
          {
            id: createSavedRoomId(),
            roomId,
            displayName,
            anchorName: roomName,
            updatedAt: now,
          },
          ...config.savedRooms,
        ];

    await saveRooms(savedRooms);
  }

  function selectSavedRoom(room: SavedRoom) {
    setDraftRoomId(room.roomId);
    setSavedRoomError("");
  }

  async function deleteSavedRoom(savedRoomId: string) {
    if (editingSavedRoom?.id === savedRoomId) {
      setEditingSavedRoom(null);
    }
    setSavedRoomError("");
    await saveRooms(config.savedRooms.filter((room) => room.id !== savedRoomId));
  }

  function startEditSavedRoom(room: SavedRoom) {
    setSavedRoomError("");
    setEditingSavedRoom({
      id: room.id,
      roomId: room.roomId,
      displayName: room.displayName,
    });
  }

  async function saveEditedRoom() {
    if (!editingSavedRoom) {
      return;
    }

    const roomId = editingSavedRoom.roomId.trim();
    const displayName = editingSavedRoom.displayName.trim();
    if (!displayName) {
      setSavedRoomError("名称不能为空");
      return;
    }
    if (!isValidRoomId(roomId)) {
      setSavedRoomError("请输入有效的直播间房间号");
      return;
    }
    if (
      config.savedRooms.some(
        (room) => room.id !== editingSavedRoom.id && room.roomId === roomId,
      )
    ) {
      setSavedRoomError("该房间号已在常用直播间中");
      return;
    }

    setSavedRoomError("");
    await saveRooms(
      config.savedRooms.map((room) =>
        room.id === editingSavedRoom.id
          ? {
              ...room,
              roomId,
              displayName,
              updatedAt: new Date().toISOString(),
            }
          : room,
      ),
    );
    setEditingSavedRoom(null);
  }

  async function connectRoom(roomId: string) {
    const numericRoomId = Number(roomId.trim());
    if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      onStatusChange({ status: "idle", message: "请输入有效的直播间房间号" });
      return;
    }

    onStatusChange({
      status: "connecting",
      message: `正在连接直播间 ${roomId.trim()}`,
    });

    try {
      await saveConfig({ ...config, roomId: roomId.trim() });
      await invoke("start_bilibili_danmaku", { roomId: numericRoomId });
    } catch (error) {
      onStatusChange({ status: "disconnected", message: String(error) });
    }
  }

  async function disconnectRoom() {
    await invoke("stop_bilibili_danmaku");
    onStatusChange({ status: "disconnected", message: "已手动断开" });
  }

  async function testApi() {
    const numericRoomId = Number(draftRoomId.trim());
    if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      setApiTestError("请输入有效的直播间房间号");
      setApiTestSteps([]);
      return;
    }

    setApiTestError("");
    setApiTestSteps([]);
    setExpandedApiStepKey(null);
    setIsApiTesting(true);
    try {
      const steps = await invoke<ApiTestStep[]>("test_bilibili_api", {
        roomId: numericRoomId,
      });
      setApiTestSteps(steps);
    } catch (error) {
      setApiTestError(String(error));
    } finally {
      setIsApiTesting(false);
    }
  }

  async function resetAppearance() {
    await updateAppearance({
      fontSize: 20,
      opacity: 0.94,
      scrollDuration: 12,
      density: "medium",
      showUsername: false,
      color: "white",
    });
  }

  async function saveShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: draftShortcut,
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function resetShortcut() {
    setDraftShortcut(defaultShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: defaultShortcutLabel(),
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  return (
    <main className="control-window">
      <header className="control-header">
        <strong>Drift 设置</strong>
        <button
          onClick={() => invoke("hide_window", { label: "control" })}
          type="button"
        >
          隐藏
        </button>
      </header>

      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <section className="settings-panel">
        {activeTab === "room" ? (
          <RoomSettings
            config={config}
            draftRoomId={draftRoomId}
            editingSavedRoom={editingSavedRoom}
            isConnected={isConnected}
            onConnect={() => connectRoom(draftRoomId)}
            onDeleteRoom={deleteSavedRoom}
            onDisconnect={disconnectRoom}
            onEditRoomChange={setEditingSavedRoom}
            onRoomIdChange={setDraftRoomId}
            onSaveCurrentRoom={saveCurrentRoom}
            onSaveEditedRoom={saveEditedRoom}
            onSelectRoom={selectSavedRoom}
            onStartEditRoom={startEditSavedRoom}
            onStopEditRoom={() => setEditingSavedRoom(null)}
            savedRoomError={savedRoomError}
            status={status}
          />
        ) : null}

        {activeTab === "display" ? (
          <DisplaySettings
            appearance={config.appearance}
            onResetAppearance={resetAppearance}
            onUpdateAppearance={updateAppearance}
          />
        ) : null}

        {activeTab === "filter" ? (
          <FilterSettings
            draftBlockedWords={draftBlockedWords}
            onBlockedWordsChange={setDraftBlockedWords}
            onSaveBlockedWords={saveBlockedWords}
          />
        ) : null}

        {activeTab === "shortcuts" ? (
          <ShortcutSettings
            draftShortcut={draftShortcut}
            onResetShortcut={resetShortcut}
            onSaveShortcut={saveShortcut}
            onShortcutChange={setDraftShortcut}
            shortcutError={shortcutError}
          />
        ) : null}

        {activeTab === "diagnostics" ? (
          <DiagnosticsSettings
            apiTestError={apiTestError}
            apiTestSteps={apiTestSteps}
            draftRoomId={draftRoomId}
            expandedApiStepKey={expandedApiStepKey}
            isApiTesting={isApiTesting}
            onExpandedApiStepChange={setExpandedApiStepKey}
            onTestApi={testApi}
          />
        ) : null}
      </section>

      <footer className="control-footer">
        <span>{config.shortcuts.toggleEditMode} 切换编辑模式</span>
      </footer>
    </main>
  );
}

function createSavedRoomId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidRoomId(roomId: string) {
  const numericRoomId = Number(roomId.trim());
  return Number.isSafeInteger(numericRoomId) && numericRoomId > 0;
}
