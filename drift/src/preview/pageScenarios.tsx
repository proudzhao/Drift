import { useState, type ReactNode } from "react";
import { AccountSettings } from "../components/control/AccountSettings";
import { AboutSettings } from "../components/control/AboutSettings";
import { ControlShell } from "../components/control/ControlShell";
import { ControlUpdateNotice } from "../components/control/ControlUpdateNotice";
import { DiagnosticsSettings } from "../components/control/DiagnosticsSettings";
import { FilterSettings } from "../components/control/FilterSettings";
import { RoomSettings } from "../components/control/RoomSettings";
import type { EditingSavedRoom } from "../components/control/SavedRoomList";
import type { SettingsTab } from "../components/control/settingsNavigation";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  type FilterRule,
  type SavedRoom,
} from "../types/config";
import {
  PREVIEW_CONFIG,
  PREVIEW_CONNECTED_STATUS,
  PREVIEW_DIAGNOSTIC_STEPS,
  PREVIEW_FILTER_RULES,
  PREVIEW_STATUS,
  PREVIEW_UPDATE_AVAILABLE,
  PREVIEW_UPDATE_ERROR,
} from "./fixtures";

export type ControlPageScenarioId =
  | "default"
  | "room-empty"
  | "room-connected"
  | "account-logged-out"
  | "account-logged-in"
  | "account-qr"
  | "filters-empty"
  | "filters-long"
  | "diagnostics-expanded"
  | "update-available"
  | "update-error";

export type ControlPageScenario = {
  id: ControlPageScenarioId;
  label: string;
};

export const CONTROL_PAGE_SCENARIOS: ControlPageScenario[] = [
  { id: "default", label: "默认控制面板" },
  { id: "room-empty", label: "直播间空列表" },
  { id: "room-connected", label: "直播间已连接" },
  { id: "account-logged-out", label: "账号未登录" },
  { id: "account-logged-in", label: "账号已登录" },
  { id: "account-qr", label: "账号二维码" },
  { id: "filters-empty", label: "过滤规则空列表" },
  { id: "filters-long", label: "过滤规则长内容" },
  { id: "diagnostics-expanded", label: "诊断展开" },
  { id: "update-available", label: "发现更新" },
  { id: "update-error", label: "更新失败" },
];

export function getControlPageScenario(value: string | null) {
  return (
    CONTROL_PAGE_SCENARIOS.find((scenario) => scenario.id === value) ??
    CONTROL_PAGE_SCENARIOS[0]
  );
}

type ControlPageScenarioPreviewProps = {
  scenarioId: ControlPageScenarioId;
};

export function ControlPageScenarioPreview({
  scenarioId,
}: ControlPageScenarioPreviewProps) {
  switch (scenarioId) {
    case "room-connected":
      return <RoomScenario connected />;
    case "account-logged-out":
      return <AccountScenario mode="logged-out" />;
    case "account-logged-in":
      return <AccountScenario mode="logged-in" />;
    case "account-qr":
      return <AccountScenario mode="qr" />;
    case "filters-empty":
      return <FilterScenario initialRules={[]} />;
    case "filters-long":
      return <FilterScenario initialRules={PREVIEW_FILTER_RULES} />;
    case "diagnostics-expanded":
      return <DiagnosticsScenario />;
    case "update-available":
      return <UpdateScenario mode="available" />;
    case "update-error":
      return <UpdateScenario mode="error" />;
    case "default":
    case "room-empty":
    default:
      return <RoomScenario connected={false} empty />;
  }
}

type ScenarioShellProps = {
  activeTab: SettingsTab;
  children: ReactNode;
  updateNotice?: ReactNode;
};

function ScenarioShell({
  activeTab,
  children,
  updateNotice,
}: ScenarioShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ControlShell
      activeTab={activeTab}
      collapsed={collapsed}
      footer={<span>开发预览场景 · 不会保存到本机配置</span>}
      onCollapsedChange={setCollapsed}
      onTabChange={noop}
      status={<span>固定开发场景</span>}
      updateNotice={updateNotice}
    >
      {children}
    </ControlShell>
  );
}

function RoomScenario({
  connected,
  empty = false,
}: {
  connected: boolean;
  empty?: boolean;
}) {
  const initialRooms = empty ? [] : PREVIEW_CONFIG.savedRooms;
  const [draftRoomId, setDraftRoomId] = useState(connected ? "123456" : "");
  const [rooms, setRooms] = useState<SavedRoom[]>(initialRooms);
  const [editingSavedRoom, setEditingSavedRoom] =
    useState<EditingSavedRoom | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(
    ALL_SAVED_ROOM_GROUP_ID,
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRooms = rooms.filter((room) => {
    const matchesGroup =
      selectedGroupId === ALL_SAVED_ROOM_GROUP_ID ||
      room.groupId === selectedGroupId;
    const matchesSearch =
      !normalizedQuery ||
      [room.roomId, room.displayName, room.anchorName]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    return matchesGroup && matchesSearch;
  });

  function startEditing(room: SavedRoom) {
    setEditingSavedRoom({
      displayName: room.displayName,
      groupId: room.groupId,
      id: room.id,
      roomId: room.roomId,
    });
  }

  function saveEditedRoom() {
    if (!editingSavedRoom) return;
    setRooms((current) =>
      current.map((room) =>
        room.id === editingSavedRoom.id
          ? { ...room, ...editingSavedRoom }
          : room,
      ),
    );
    setEditingSavedRoom(null);
  }

  return (
    <ScenarioShell activeTab="room">
      <RoomSettings
        config={{ ...PREVIEW_CONFIG, savedRooms: rooms }}
        draftRoomId={draftRoomId}
        editingSavedRoom={editingSavedRoom}
        filteredSavedRooms={filteredRooms}
        isConnected={connected}
        onConnect={noop}
        onCreateGroup={resolveTrue}
        onDeleteGroup={resolveTrue}
        onDeleteRoom={(roomId) =>
          setRooms((current) => current.filter((room) => room.id !== roomId))
        }
        onDisconnect={noop}
        onEditRoomChange={setEditingSavedRoom}
        onGroupChange={setSelectedGroupId}
        onRenameGroup={resolveTrue}
        onRoomIdChange={setDraftRoomId}
        onSaveCurrentRoom={noop}
        onSaveEditedRoom={saveEditedRoom}
        onSearchQueryChange={setSearchQuery}
        onSelectRoom={(room) => setDraftRoomId(room.roomId)}
        onStartEditRoom={startEditing}
        onStopEditRoom={() => setEditingSavedRoom(null)}
        savedRoomError=""
        savedRoomSearchQuery={searchQuery}
        selectedGroupId={selectedGroupId}
        status={connected ? PREVIEW_CONNECTED_STATUS : PREVIEW_STATUS}
      />
    </ScenarioShell>
  );
}

function AccountScenario({
  mode,
}: {
  mode: "logged-out" | "logged-in" | "qr";
}) {
  const isLoggedIn = mode === "logged-in";
  const isQr = mode === "qr";

  return (
    <ScenarioShell activeTab="account">
      <AccountSettings
        authError=""
        authStatus={
          isLoggedIn
            ? {
                isLoggedIn: true,
                uid: 424242,
                username: "DriftPreview",
                lastValidatedAt: 1786896000,
                expiresAt: 1789488000,
              }
            : { isLoggedIn: false }
        }
        isAuthBusy={false}
        isPolling={isQr}
        onLogout={noop}
        onStartLogin={noop}
        onValidateSession={noop}
        pollResult={
          isQr
            ? { code: 0, status: "scanned", message: "已扫码，请在手机确认" }
            : null
        }
        qrSession={
          isQr
            ? {
                qrcodeKey: "preview-qrcode-key",
                url: "https://passport.bilibili.com/h5-app/passport/login/scan?preview=1",
              }
            : null
        }
      />
    </ScenarioShell>
  );
}

function FilterScenario({ initialRules }: { initialRules: FilterRule[] }) {
  const [rules, setRules] = useState(initialRules);

  return (
    <ScenarioShell activeTab="filter">
      <FilterSettings onRulesChange={setRules} rules={rules} />
    </ScenarioShell>
  );
}

function DiagnosticsScenario() {
  const [expandedStepKey, setExpandedStepKey] = useState<string | null>(
    "room_init",
  );
  const [mockPanelEnabled, setMockPanelEnabled] = useState(true);

  return (
    <ScenarioShell activeTab="diagnostics">
      <DiagnosticsSettings
        apiTestError=""
        apiTestSteps={PREVIEW_DIAGNOSTIC_STEPS}
        draftRoomId="123456"
        expandedApiStepKey={expandedStepKey}
        isApiTesting={false}
        mockPanelEnabled={mockPanelEnabled}
        onExpandedApiStepChange={setExpandedStepKey}
        onMockPanelToggle={setMockPanelEnabled}
        onTestApi={noop}
      />
    </ScenarioShell>
  );
}

function UpdateScenario({ mode }: { mode: "available" | "error" }) {
  const [updateConfig, setUpdateConfig] = useState(PREVIEW_CONFIG.update);
  const updateState =
    mode === "available" ? PREVIEW_UPDATE_AVAILABLE : PREVIEW_UPDATE_ERROR;
  const updateNotice =
    mode === "available" ? (
      <ControlUpdateNotice
        onDismiss={noop}
        onInstall={noop}
        onOpenRelease={noop}
        onRestart={noop}
        onShowDetails={noop}
        progressPercent={null}
        updateState={updateState}
      />
    ) : undefined;

  return (
    <ScenarioShell activeTab="about" updateNotice={updateNotice}>
      <AboutSettings
        onCheckUpdate={noop}
        onInstallUpdate={noop}
        onLoadCurrentVersion={noop}
        onRestartApp={noop}
        onUpdateConfigChange={(patch) =>
          setUpdateConfig((current) => ({ ...current, ...patch }))
        }
        updateConfig={updateConfig}
        updateState={updateState}
      />
    </ScenarioShell>
  );
}

function noop() {}

async function resolveTrue() {
  return true;
}
