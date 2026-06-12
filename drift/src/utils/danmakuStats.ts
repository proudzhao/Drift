import type { LiveMessage, LiveMessageKind } from "../types/danmaku";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const TOP_USER_LIMIT = 10;
const TOP_WORD_LIMIT = 10;

const STOP_WORDS = new Set([
  "一个",
  "一下",
  "不是",
  "今天",
  "什么",
  "可以",
  "哈哈",
  "哈哈哈",
  "就是",
  "我们",
  "这个",
  "真的",
  "主播",
  "弹幕",
  "那个",
  "你们",
  "他们",
]);

export type DanmakuStatsEntry = {
  kind: LiveMessageKind;
  text: string;
  timestamp: number;
  user: string;
};

export type DanmakuStatsSnapshot = {
  startedAt: number;
  updatedAt: number;
  totalMessages: number;
  lastMinuteMessages: number;
  lastFiveMinuteMessages: number;
  messagesPerMinute: number;
  kindCounts: Record<LiveMessageKind, number>;
  topUsers: Array<{ user: string; count: number }>;
  topWords: Array<{ word: string; count: number }>;
};

export function createKindCounts(): Record<LiveMessageKind, number> {
  return {
    danmaku: 0,
    gift: 0,
    guard: 0,
    super_chat: 0,
  };
}

export function createEmptyStatsSnapshot(now = Date.now()): DanmakuStatsSnapshot {
  return {
    startedAt: now,
    updatedAt: now,
    totalMessages: 0,
    lastMinuteMessages: 0,
    lastFiveMinuteMessages: 0,
    messagesPerMinute: 0,
    kindCounts: createKindCounts(),
    topUsers: [],
    topWords: [],
  };
}

export function appendStatsEntries(
  entries: DanmakuStatsEntry[],
  kindCounts: Record<LiveMessageKind, number>,
  messages: LiveMessage[],
  now = Date.now(),
) {
  for (const message of messages) {
    entries.push({
      kind: message.kind,
      text: message.text,
      timestamp: now,
      user: message.user,
    });
    kindCounts[message.kind] += 1;
  }
  pruneStatsEntries(entries, now);
}

export function buildStatsSnapshot(
  entries: DanmakuStatsEntry[],
  kindCounts: Record<LiveMessageKind, number>,
  totalMessages: number,
  startedAt: number,
  now = Date.now(),
): DanmakuStatsSnapshot {
  pruneStatsEntries(entries, now);

  const lastMinuteStart = now - ONE_MINUTE_MS;
  const lastMinuteMessages = entries.reduce(
    (count, entry) => count + (entry.timestamp >= lastMinuteStart ? 1 : 0),
    0,
  );

  return {
    startedAt,
    updatedAt: now,
    totalMessages,
    lastMinuteMessages,
    lastFiveMinuteMessages: entries.length,
    messagesPerMinute: lastMinuteMessages,
    kindCounts: { ...kindCounts },
    topUsers: topEntries(countUsers(entries), TOP_USER_LIMIT).map(
      ([user, count]) => ({ user, count }),
    ),
    topWords: topEntries(countWords(entries), TOP_WORD_LIMIT).map(
      ([word, count]) => ({ word, count }),
    ),
  };
}

function pruneStatsEntries(entries: DanmakuStatsEntry[], now: number) {
  const cutoff = now - FIVE_MINUTES_MS;
  let removable = 0;
  while (removable < entries.length && entries[removable].timestamp < cutoff) {
    removable += 1;
  }
  if (removable > 0) {
    entries.splice(0, removable);
  }
}

function countUsers(entries: DanmakuStatsEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const user = entry.user.trim();
    if (!user) continue;
    counts.set(user, (counts.get(user) ?? 0) + 1);
  }
  return counts;
}

function countWords(entries: DanmakuStatsEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const word of tokenize(entry.text)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

function topEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, limit);
}

function tokenize(text: string) {
  const normalized = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, " ");
  const words: string[] = [];

  for (const match of normalized.matchAll(/[\p{Script=Han}]+|[\p{Letter}\p{Number}]{2,}/gu)) {
    const token = match[0].trim().toLowerCase();
    if (!token || /^\d+$/.test(token)) continue;
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      words.push(...splitChineseToken(token));
    } else if (!STOP_WORDS.has(token)) {
      words.push(token);
    }
  }

  return words;
}

function splitChineseToken(token: string) {
  if (token.length <= 4) {
    return STOP_WORDS.has(token) ? [] : [token];
  }

  const words: string[] = [];
  for (let index = 0; index + 1 < token.length; index += 2) {
    const word = token.slice(index, index + 2);
    if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
      words.push(word);
    }
  }
  return words;
}
