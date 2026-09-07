import type { LiveMessage } from "./danmaku";

export type RoomSessionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "not_live"
  | "invalid_room"
  | "error";

export type RoomSessionSnapshot = {
  sessionId: string;
  requestedRoomId: number;
  roomId?: number;
  anchorName?: string;
  fanMedalName?: string;
  status: RoomSessionStatus;
  message: string;
  liveStatus?: number;
};

export type DanmakuRoomBatch = {
  sessionId: string;
  roomId: number;
  anchorName?: string;
  fanMedalName?: string;
  activeSourceCount: number;
  messages: LiveMessage[];
};

export type RoomSourceOption = {
  roomId: number;
  label: string;
};

export const isNetworkSessionActive = (status: RoomSessionStatus) =>
  status === "connecting" || status === "connected" || status === "reconnecting";

export const isSourceActive = (status: RoomSessionStatus) =>
  status === "connected" || status === "reconnecting";
