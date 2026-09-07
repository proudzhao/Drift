import type { RoomSessionSnapshot } from "../../types/roomSession";
import { isNetworkSessionActive } from "../../types/roomSession";
import { Button } from "../ui";
import { DataValue, StatusDot, type StatusTone } from "./settings-ui";

type RoomSessionListProps = {
  commandErrors: Record<string, string>;
  onDisconnectSession: (sessionId: string) => void | Promise<void>;
  onRetrySession: (session: RoomSessionSnapshot) => void | Promise<void>;
  onSaveRoom: (session: RoomSessionSnapshot) => void | Promise<void>;
  sessions: RoomSessionSnapshot[];
};

export function RoomSessionList({
  commandErrors,
  onDisconnectSession,
  onRetrySession,
  onSaveRoom,
  sessions,
}: RoomSessionListProps) {
  return (
    <div className="grid min-w-0">
      {sessions.map((session) => {
        const roomId = session.roomId ?? session.requestedRoomId;
        const active = isNetworkSessionActive(session.status);
        return (
          <div
            className="drift-theme-transition grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-drift-line px-3 py-2.5 first:border-t-0 max-[519px]:grid-cols-1"
            key={session.sessionId}
          >
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <strong className="drift-theme-transition truncate text-[11px] text-drift-ink">
                  {session.anchorName?.trim() || `房间 ${roomId}`}
                </strong>
                <StatusDot
                  label={sessionStatusText(session)}
                  tone={sessionStatusTone(session.status)}
                />
              </div>
              <DataValue>{session.message}</DataValue>
              {commandErrors[session.sessionId] ? (
                <span
                  className="drift-theme-transition text-[9px] text-[var(--drift-ui-danger)]"
                  role="alert"
                >
                  {commandErrors[session.sessionId]}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 max-[519px]:justify-start">
              <Button
                aria-label={`保存房间 ${roomId} 为常用`}
                onClick={() => void onSaveRoom(session)}
                size="sm"
              >
                保存为常用
              </Button>
              {active ? (
                <Button
                  aria-label={`断开房间 ${roomId}`}
                  onClick={() => void onDisconnectSession(session.sessionId)}
                  size="sm"
                  variant="danger"
                >
                  断开
                </Button>
              ) : (
                <Button
                  aria-label={`重试房间 ${roomId}`}
                  onClick={() => void onRetrySession(session)}
                  size="sm"
                  variant="primary"
                >
                  重试
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function sessionStatusText(session: RoomSessionSnapshot) {
  switch (session.status) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重连中";
    case "not_live":
      return "未开播";
    case "invalid_room":
      return "房间号不存在";
    case "error":
      return "连接失败";
    case "disconnected":
    default:
      return "已断开";
  }
}

export function sessionStatusTone(
  status: RoomSessionSnapshot["status"],
): StatusTone {
  switch (status) {
    case "connected":
      return "success";
    case "connecting":
    case "reconnecting":
      return "signal";
    case "error":
      return "danger";
    case "not_live":
    case "invalid_room":
    case "disconnected":
    default:
      return "warning";
  }
}
