export type LiveMessageKind = "danmaku" | "gift" | "guard";

export type DanmakuItem = {
  id: string;
  kind: LiveMessageKind;
  user?: string;
  text: string;
  track: number;
  duration: number;
  delay: number;
  createdAt: number;
  highlighted?: boolean;
  elder?: boolean;
  exiting?: boolean;
};

export type LiveMessage = {
  id: string;
  roomId?: number;
  kind: LiveMessageKind;
  user: string;
  text: string;
  timestamp?: number;
  giftName?: string;
  giftCount?: number;
  guardLevel?: 1 | 2 | 3;
  guardName?: "总督" | "提督" | "舰长";
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
