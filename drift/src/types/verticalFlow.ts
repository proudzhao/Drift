import type { VerticalOverflowPolicy } from "./config";

export type VerticalSpeedMultiplier = 1 | 2 | 4 | 8;

export type VerticalFlowStatus = {
  active: boolean;
  policy: VerticalOverflowPolicy;
  backlog: number;
  speedMultiplier: VerticalSpeedMultiplier;
  droppedTotal: number;
};

export const EMPTY_VERTICAL_FLOW_STATUS: VerticalFlowStatus = {
  active: false,
  policy: "realtime",
  backlog: 0,
  speedMultiplier: 1,
  droppedTotal: 0,
};
