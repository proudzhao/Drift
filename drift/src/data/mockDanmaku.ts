import type { DanmakuItem, LiveDanmakuMessage } from "../types/danmaku";

const sampleTexts = [
  "主播刚才那句可以截图当壁纸",
  "前排路过，顺手把咖啡续上",
  "这条弹幕正在优雅地横穿屏幕",
  "有人看到我的消息吗，看到扣个 1",
  "今天的弹幕氛围很松弛",
  "别急，我已经在认真假装懂了",
  "这速度刚好，不晃眼",
  "Command+Option+K 切换编辑模式",
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

const mockUsers = [
  "吃瓜群众007",
  "弹幕小能手",
  "路过的一只",
  "前排围观专业户",
  "屏幕清洁工",
  "深夜摸鱼人",
  "哈哈哈怪",
  "精准吐槽官",
  "社恐患者",
  "暴躁老哥在线",
  "课代表来了",
  "显微镜女孩",
  "哲学の路人",
  "今天也很元气",
  "退休弹幕员",
];

const shortTexts = [
  "哈哈哈",
  "来了来了",
  "？？？",
  "好活",
  "草",
  "打卡",
  "前排",
  "笑死",
  "真实",
  "确实",
  "6",
  "可以",
  "哇",
  "妙啊",
  "牛",
];

const mediumTexts = [
  "这个操作太秀了吧",
  "主播今天状态好好",
  "有人解释一下发生什么了吗",
  "刚刚那波我没看清",
  "弹幕飘过一下",
  "今天直播间氛围真不错",
  "这段笑死我了",
];

const longTexts = [
  "我觉得这个游戏的音乐可以再优化一下，但整体玩法真的很不错，上头的很",
  "刚下班回家就打开直播间，就是想听听主播的声音放松一下，弹幕飘起来很有氛围感",
  "有人分享一下最近有什么好玩的游戏吗，想周末和朋友一起玩，弹幕推荐一下",
  "主播刚才讲的那个操作思路让我突然想通了一个困扰很久的问题，太感谢了",
  "做菜的教程看再多也不如自己动手试试，主播真的适合当老师好好好",
];

let mockSeq = 0;

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** 生成一条可注入 pendingMessagesRef 的 mock 消息 */
export function generateMockMessage(): LiveDanmakuMessage {
  mockSeq += 1;

  const user = pick(mockUsers);
  const roll = Math.random();

  let text: string;
  if (roll < 0.35) {
    text = pick(shortTexts);
  } else if (roll < 0.75) {
    text = pick(mediumTexts);
  } else {
    text = pick(longTexts);
  }

  return {
    id: `mock-${Date.now()}-${mockSeq}`,
    user,
    text,
  };
}

/** 一次生成指定数量的 mock 消息（用于爆发测试） */
export function generateMockBatch(count: number): LiveDanmakuMessage[] {
  return Array.from({ length: count }, () => generateMockMessage());
}

export function createMockDanmakuItems(): DanmakuItem[] {
  return sampleTexts.map((text, index) => ({
    id: `mock-${index}`,
    text,
    track: index % 5,
    duration: 12 + (index % 3) * 2,
    delay: index * 1.3,
  }));
}
