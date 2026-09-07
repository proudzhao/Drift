import { useRef, useState } from "react";
import {
  SendDanmakuView,
  type SendFeedbackTone,
} from "../components/SendDanmakuView";
import { ThemeScenarioScope } from "./ThemeScenarioScope";

export type SendWindowScenarioId =
  | "send-ready"
  | "send-multi-room-targets"
  | "send-unavailable"
  | "send-cooldown"
  | "send-sending"
  | "send-success"
  | "send-error"
  | "send-over-limit"
  | "send-long-content"
  | "send-theme-light";

export const SEND_WINDOW_SCENARIOS = [
  { id: "send-ready", label: "发送窗口 / 准备发送" },
  { id: "send-multi-room-targets", label: "发送窗口 / 多房目标选择" },
  { id: "send-unavailable", label: "发送窗口 / 不可发送" },
  { id: "send-cooldown", label: "发送窗口 / 冷却" },
  { id: "send-sending", label: "发送窗口 / 发送中" },
  { id: "send-success", label: "发送窗口 / 成功" },
  { id: "send-error", label: "发送窗口 / 失败" },
  { id: "send-over-limit", label: "发送窗口 / 超限" },
  { id: "send-long-content", label: "发送窗口 / 长内容" },
  { id: "send-theme-light", label: "发送窗口 / 亮色主题" },
] as const;

const SEND_SCENARIO_IDS = new Set<string>(
  SEND_WINDOW_SCENARIOS.map((scenario) => scenario.id),
);

export function isSendWindowScenarioId(
  value: string,
): value is SendWindowScenarioId {
  return SEND_SCENARIO_IDS.has(value);
}

type SendFixture = {
  canSend: boolean;
  feedback: string;
  isSending: boolean;
  remaining: number;
  selectedRoomId: number | null;
  text: string;
  tone: SendFeedbackTone;
  targets: Array<{ roomId: number; label: string }>;
};

const READY_FIXTURE: SendFixture = {
  canSend: true,
  feedback: "准备发送",
  isSending: false,
  remaining: 60,
  selectedRoomId: 123456,
  text: "",
  tone: "signal",
  targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
};

const FIXTURES: Record<SendWindowScenarioId, SendFixture> = {
  "send-ready": READY_FIXTURE,
  "send-multi-room-targets": {
    canSend: true,
    feedback: "房间 7 发送已就绪",
    isSending: false,
    remaining: 48,
    selectedRoomId: 7,
    text: "向房间 7 发送的固定预览弹幕",
    tone: "signal",
    targets: [
      { roomId: 6, label: "补给箱 · 6" },
      { roomId: 7, label: "小海梓 · 7" },
    ],
  },
  "send-unavailable": {
    canSend: false,
    feedback: "请先登录 B 站并连接直播间",
    isSending: false,
    remaining: 60,
    selectedRoomId: null,
    text: "",
    tone: "warning",
    targets: [],
  },
  "send-cooldown": {
    canSend: false,
    feedback: "已发送，稍后可继续发送",
    isSending: false,
    remaining: 52,
    selectedRoomId: 123456,
    text: "下一条弹幕",
    tone: "warning",
    targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
  },
  "send-sending": {
    canSend: false,
    feedback: "发送中",
    isSending: true,
    remaining: 54,
    selectedRoomId: 123456,
    text: "正在发送",
    tone: "signal",
    targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
  },
  "send-success": {
    canSend: false,
    feedback: "发送成功",
    isSending: false,
    remaining: 60,
    selectedRoomId: 123456,
    text: "",
    tone: "success",
    targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
  },
  "send-error": {
    canSend: true,
    feedback: "Error: 发送失败，请检查网络后重试",
    isSending: false,
    remaining: 52,
    selectedRoomId: 123456,
    text: "保留的弹幕内容",
    tone: "danger",
    targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
  },
  "send-over-limit": {
    canSend: false,
    feedback: "弹幕内容不能超过 60 个字符",
    isSending: false,
    remaining: -3,
    selectedRoomId: 123456,
    text: "这是一条用于预览超过六十个 Unicode 字符限制时界面表现的固定弹幕内容示例文本，继续补足三个字符",
    tone: "danger",
    targets: [{ roomId: 123456, label: "星瞳_Official · 123456" }],
  },
  "send-long-content": {
    canSend: true,
    feedback:
      "该长错误文案用于检查状态轨道的截断和固定高度，并确认持续增长的错误详情不会改变窗口尺寸",
    isSending: false,
    remaining: 42,
    selectedRoomId: 123456,
    text: "长内容预览",
    tone: "danger",
    targets: [
      {
        roomId: 123456,
        label:
          "这是一个用于检查目标文本截断的超长主播名称_Official_持续直播特别加长版本 · 123456",
      },
    ],
  },
  "send-theme-light": READY_FIXTURE,
};

export function SendWindowScenarioPreview({
  scenarioId,
}: {
  scenarioId: SendWindowScenarioId;
}) {
  const fixture = FIXTURES[scenarioId];
  const { text: initialText, ...viewProps } = fixture;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const theme = scenarioId === "send-theme-light" ? "light" : "dark";

  return (
    <ThemeScenarioScope theme={theme}>
      <div
        className={
          theme === "light"
            ? "grid h-screen w-screen place-items-center overflow-hidden bg-[var(--drift-ui-workspace)]"
            : "grid min-h-screen w-screen place-items-center overflow-auto bg-[linear-gradient(135deg,#344b55,#16262e)] p-6 max-[461px]:overflow-hidden max-[461px]:p-0"
        }
      >
        <div className="h-[132px] w-full max-w-[460px] shrink-0">
          <SendDanmakuView
            {...viewProps}
            inputRef={inputRef}
            onClose={() => undefined}
            onDragStart={() => undefined}
            onInputKeyDown={() => undefined}
            onSend={() => undefined}
            onTargetChange={() => undefined}
            onTextChange={setText}
            text={text}
          />
        </div>
      </div>
    </ThemeScenarioScope>
  );
}
