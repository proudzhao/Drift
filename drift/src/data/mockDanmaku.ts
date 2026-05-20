import type { DanmakuItem } from "../types/danmaku";

const sampleTexts = [
  "主播刚才那句可以截图当壁纸",
  "前排路过，顺手把咖啡续上",
  "这条弹幕正在优雅地横穿屏幕",
  "有人看到我的消息吗，看到扣个 1",
  "今天的弹幕氛围很松弛",
  "别急，我已经在认真假装懂了",
  "这速度刚好，不晃眼",
  "Command+Option+D 切换编辑模式",
  "如果这条飘完不再回来，就说明它长大了",
  "弹幕从右边来，带着一点点仪式感",
  "我宣布这里是桌面观赛最佳位置",
  "主播讲重点了，手里的零食先暂停",
  "星瞳一开口，屏幕都亮了一点",
  "瞳宝今天这个状态也太灵了",
  "舞台感来了，桌面弹幕也跟着起飞",
  "这段可以循环看十遍",
  "星瞳的表情管理一直很在线",
  "前排递荧光棒，氛围组集合",
  "刚切进来就被可爱到了",
  "瞳门！",
  "歌声一出来，工作都暂停三分钟",
  "今天也是被星瞳治愈的一天",
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
