import type { DanmakuItem } from "../types/danmaku";

const sampleTexts = [
  "Drift 阶段 1：透明置顶窗口验证",
  "这条弹幕应该从右往左轻轻飘过",
  "鼠标穿透开启后，下面的窗口应该可以被点击",
  "透明背景 + 置顶 + 无边框",
  "假弹幕先跑起来，真实弹幕下一阶段接入",
  "让弹幕飘过桌面",
  "Command+Option+D 可以切换编辑模式",
  "如果你能看见桌面，透明窗口就成功了一半",
];

export function createMockDanmakuItems(): DanmakuItem[] {
  return sampleTexts.map((text, index) => ({
    id: `mock-${index}`,
    text,
    track: index % 5,
    duration: 12 + (index % 3) * 2,
    delay: index * 1.3,
  }));
}
