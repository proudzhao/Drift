import type { RoomSessionStatus } from "./roomSession";

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

export type DisplayMessageItem = {
  id: string;
  kind: LiveMessageKind;
  sourceLabel?: string;
  sourceColorIndex?: number;
  user?: string;
  text: string;
  segments?: LiveMessageSegment[];
  currentRoomFanMedalLevel?: number;
  followedUser?: boolean;
  highlighted?: boolean;
  isSelf?: boolean;
  superChatPrice?: number;
  superChatDuration?: number;
  superChatColor?: string;
};

export type DanmakuItem = DisplayMessageItem & {
  track: number;
  duration: number;
  delay: number;
  createdAt: number;
};

export type VerticalChatItem = DisplayMessageItem & {
  createdAt: number;
};

export type LiveMessage = {
  id: string;
  roomId?: number;
  senderUid?: number;
  currentRoomFanMedal?: "yes" | "no" | "unknown";
  currentRoomFanMedalLevel?: number;
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

export type QueuedLiveMessage = LiveMessage & {
  attempts: number;
  followedUser?: boolean;
  highlighted?: boolean;
  queuedAt: number;
  sourceLabel?: string;
  sourceColorIndex?: number;
  sourceSessionId?: string;
  sourceRoomId?: number;
  sourceAnchorName?: string;
  sourceFanMedalName?: string;
};

export type SendDanmakuStatus = {
  canSend: boolean;
  reason: string;
  roomId?: number;
  anchorName?: string;
  status: RoomSessionStatus | null;
  cooldownMs: number;
};

export type SendDanmakuResult = {
  code: number;
  message: string;
  cooldownMs: number;
};
