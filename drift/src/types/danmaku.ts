export type LiveMessageKind = "danmaku" | "gift" | "guard" | "super_chat";

export type LiveMessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "emote";
      text: string;
      url?: string;
      width?: number;
      height?: number;
    };

export type DanmakuItem = {
  id: string;
  kind: LiveMessageKind;
  user?: string;
  text: string;
  segments?: LiveMessageSegment[];
  track: number;
  duration: number;
  delay: number;
  createdAt: number;
  highlighted?: boolean;
  isSelf?: boolean;
  superChatPrice?: number;
  superChatDuration?: number;
  superChatColor?: string;
  elder?: boolean;
  exiting?: boolean;
};

export type LiveMessage = {
  id: string;
  roomId?: number;
  kind: LiveMessageKind;
  user: string;
  text: string;
  segments?: LiveMessageSegment[];
  isSelf?: boolean;
  timestamp?: number;
  giftName?: string;
  giftCount?: number;
  guardLevel?: 1 | 2 | 3;
  guardName?: "总督" | "提督" | "舰长";
  superChatPrice?: number;
  superChatDuration?: number;
  superChatColor?: string;
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

export type SendDanmakuStatus = {
  canSend: boolean;
  reason: string;
  roomId?: number;
  anchorName?: string;
  status: DanmakuStatus["status"];
  cooldownMs: number;
};

export type SendDanmakuResult = {
  code: number;
  message: string;
  cooldownMs: number;
};
