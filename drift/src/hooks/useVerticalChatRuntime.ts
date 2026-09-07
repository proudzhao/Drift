import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AppearanceConfig,
  VerticalOverflowPolicy,
} from "../types/config";
import type {
  QueuedLiveMessage,
  VerticalChatItem,
} from "../types/danmaku";
import type {
  VerticalFlowStatus,
  VerticalSpeedMultiplier,
} from "../types/verticalFlow";
import {
  enqueueVerticalMessages,
  takeVerticalMessages,
  VERTICAL_FLUSH_INTERVAL_MS,
  verticalFlushLimit,
  verticalSpeedMultiplier,
} from "../utils/verticalChatRuntime";

type UseVerticalChatRuntimeParams = {
  active: boolean;
  density: AppearanceConfig["density"];
  policy: VerticalOverflowPolicy;
};

type UseVerticalChatRuntimeResult = {
  items: VerticalChatItem[];
  status: VerticalFlowStatus;
  enqueue: (messages: QueuedLiveMessage[]) => void;
  clear: () => void;
  prune: (itemIds: string[]) => void;
};

function toVerticalChatItem(
  message: QueuedLiveMessage,
  sequence: number,
  createdAt: number,
): VerticalChatItem {
  return {
    id: `${message.id}-vertical-${sequence}`,
    kind: message.kind,
    sourceLabel: message.sourceLabel,
    sourceColorIndex: message.sourceColorIndex,
    user: message.user,
    text: message.text,
    segments: message.segments,
    currentRoomFanMedalLevel: message.currentRoomFanMedalLevel,
    createdAt,
    followedUser: message.followedUser,
    highlighted: message.highlighted,
    isSelf: message.isSelf,
    superChatPrice: message.superChatPrice,
    superChatDuration: message.superChatDuration,
    superChatColor: message.superChatColor,
  };
}

function currentSpeedMultiplier(
  policy: VerticalOverflowPolicy,
  queue: QueuedLiveMessage[],
  now: number,
): VerticalSpeedMultiplier {
  return policy === "complete" ? verticalSpeedMultiplier(queue, now) : 1;
}

function sameVerticalFlowStatus(
  previous: VerticalFlowStatus,
  next: VerticalFlowStatus,
) {
  return (
    previous.active === next.active &&
    previous.policy === next.policy &&
    previous.backlog === next.backlog &&
    previous.speedMultiplier === next.speedMultiplier &&
    previous.droppedTotal === next.droppedTotal
  );
}

export function useVerticalChatRuntime({
  active,
  density,
  policy,
}: UseVerticalChatRuntimeParams): UseVerticalChatRuntimeResult {
  const activeRef = useRef(active);
  const policyRef = useRef(policy);
  const previousPolicyRef = useRef(policy);
  const pendingRef = useRef<QueuedLiveMessage[]>([]);
  const visibleRef = useRef<VerticalChatItem[]>([]);
  const sequenceRef = useRef(0);
  const droppedRef = useRef(0);
  const multiplierRef = useRef<VerticalSpeedMultiplier>(1);
  const [items, setItems] = useState<VerticalChatItem[]>([]);
  const [status, setStatus] = useState<VerticalFlowStatus>({
    active,
    policy,
    backlog: 0,
    speedMultiplier: 1,
    droppedTotal: 0,
  });

  const refreshStatus = useCallback(() => {
    const nextStatus: VerticalFlowStatus = {
      active: activeRef.current,
      policy: policyRef.current,
      backlog: pendingRef.current.length,
      speedMultiplier: multiplierRef.current,
      droppedTotal: droppedRef.current,
    };
    setStatus((previousStatus) =>
      sameVerticalFlowStatus(previousStatus, nextStatus)
        ? previousStatus
        : nextStatus,
    );
  }, []);

  const enqueue = useCallback(
    (messages: QueuedLiveMessage[]) => {
      droppedRef.current += enqueueVerticalMessages(
        pendingRef.current,
        messages,
        policyRef.current,
      );
      multiplierRef.current = currentSpeedMultiplier(
        policyRef.current,
        pendingRef.current,
        Date.now(),
      );
      refreshStatus();
    },
    [refreshStatus],
  );

  const clear = useCallback(() => {
    pendingRef.current = [];
    visibleRef.current = [];
    sequenceRef.current = 0;
    droppedRef.current = 0;
    multiplierRef.current = 1;
    setItems([]);
    refreshStatus();
  }, [refreshStatus]);

  const prune = useCallback(
    (itemIds: string[]) => {
      if (itemIds.length === 0) {
        return;
      }

      const prunedIds = new Set(itemIds);
      const nextItems = visibleRef.current.filter(
        (item) => !prunedIds.has(item.id),
      );
      if (nextItems.length === visibleRef.current.length) {
        return;
      }

      visibleRef.current = nextItems;
      setItems(nextItems);
      refreshStatus();
    },
    [refreshStatus],
  );

  useLayoutEffect(() => {
    activeRef.current = active;
    policyRef.current = policy;
    if (
      previousPolicyRef.current !== policy &&
      policy === "realtime"
    ) {
      droppedRef.current += enqueueVerticalMessages(
        pendingRef.current,
        [],
        policy,
      );
    }
    previousPolicyRef.current = policy;
    multiplierRef.current = currentSpeedMultiplier(
      policy,
      pendingRef.current,
      Date.now(),
    );
    refreshStatus();
  }, [active, policy, refreshStatus]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      const limit = verticalFlushLimit(
        density,
        policy,
        pendingRef.current,
        now,
      );
      const messages = takeVerticalMessages(
        pendingRef.current,
        limit,
      );
      multiplierRef.current = currentSpeedMultiplier(
        policy,
        pendingRef.current,
        now,
      );

      if (messages.length > 0) {
        const nextItems = messages.map((message) => {
          const item = toVerticalChatItem(message, sequenceRef.current, now);
          sequenceRef.current += 1;
          return item;
        });
        visibleRef.current = visibleRef.current.concat(nextItems);
        setItems(visibleRef.current);
      }

      refreshStatus();
    }, VERTICAL_FLUSH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [active, density, policy, refreshStatus]);

  return { items, status, enqueue, clear, prune };
}
