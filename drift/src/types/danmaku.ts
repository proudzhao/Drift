export type DanmakuItem = {
  id: string;
  user?: string;
  text: string;
  track: number;
  duration: number;
  delay: number;
  exiting?: boolean;
};

export type LiveDanmakuMessage = {
  id: string;
  user: string;
  text: string;
};

export type DanmakuStatus = {
  status:
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected"
    | "not_live"
    | "invalid_room";
  message: string;
  roomId?: number;
  anchorName?: string;
  liveStatus?: number;
};
