import { useRef, useState } from "react";
import {
  SendDanmakuView,
  type SendFeedbackTone,
} from "../components/SendDanmakuView";

export type SendWindowScenarioId =
  | "send-ready"
  | "send-unavailable"
  | "send-cooldown"
  | "send-sending"
  | "send-success"
  | "send-error"
  | "send-over-limit"
  | "send-long-content";

export const SEND_WINDOW_SCENARIOS = [
  { id: "send-ready", label: "发送窗口 / 准备发送" },
  { id: "send-unavailable", label: "发送窗口 / 不可发送" },
  { id: "send-cooldown", label: "发送窗口 / 冷却" },
  { id: "send-sending", label: "发送窗口 / 发送中" },
  { id: "send-success", label: "发送窗口 / 成功" },
  { id: "send-error", label: "发送窗口 / 失败" },
  { id: "send-over-limit", label: "发送窗口 / 超限" },
  { id: "send-long-content", label: "发送窗口 / 长内容" },
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
  targetText: string;
  text: string;
  tone: SendFeedbackTone;
};

const FIXTURES: Record<SendWindowScenarioId, SendFixture> = {
  "send-ready": {
    canSend: true,
    feedback: "准备发送",
    isSending: false,
    remaining: 60,
    targetText: "星瞳_Official",
    text: "",
    tone: "signal",
  },
  "send-unavailable": {
    canSend: false,
    feedback: "请先登录 B 站并连接直播间",
    isSending: false,
    remaining: 60,
    targetText: "未连接",
    text: "",
    tone: "warning",
  },
  "send-cooldown": {
    canSend: false,
    feedback: "已发送，稍后可继续发送",
    isSending: false,
    remaining: 52,
    targetText: "星瞳_Official",
    text: "下一条弹幕",
    tone: "warning",
  },
  "send-sending": {
    canSend: false,
    feedback: "发送中",
    isSending: true,
    remaining: 54,
    targetText: "星瞳_Official",
    text: "正在发送",
    tone: "signal",
  },
  "send-success": {
    canSend: false,
    feedback: "发送成功",
    isSending: false,
    remaining: 60,
    targetText: "星瞳_Official",
    text: "",
    tone: "success",
  },
  "send-error": {
    canSend: true,
    feedback: "Error: 发送失败，请检查网络后重试",
    isSending: false,
    remaining: 52,
    targetText: "星瞳_Official",
    text: "保留的弹幕内容",
    tone: "danger",
  },
  "send-over-limit": {
    canSend: false,
    feedback: "弹幕内容不能超过 60 个字符",
    isSending: false,
    remaining: -3,
    targetText: "星瞳_Official",
    text: "这是一条用于预览超过六十个 Unicode 字符限制时界面表现的固定弹幕内容示例文本，继续补足三个字符",
    tone: "danger",
  },
  "send-long-content": {
    canSend: true,
    feedback:
      "该长错误文案用于检查状态轨道的截断和固定高度，并确认持续增长的错误详情不会改变窗口尺寸",
    isSending: false,
    remaining: 42,
    targetText:
      "这是一个用于检查目标文本截断的超长主播名称_Official_持续直播特别加长版本",
    text: "长内容预览",
    tone: "danger",
  },
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

  return (
    <div className="grid min-h-screen place-items-center overflow-auto bg-[linear-gradient(135deg,#344b55,#16262e)] p-6">
      <div className="h-[132px] w-[460px] shrink-0">
        <SendDanmakuView
          {...viewProps}
          inputRef={inputRef}
          onClose={() => undefined}
          onDragStart={() => undefined}
          onInputKeyDown={() => undefined}
          onSend={() => undefined}
          onTextChange={setText}
          text={text}
        />
      </div>
    </div>
  );
}
