export type FilterRuntimeStatus = {
  roomId: number | null;
  pausedFanMedalRuleIds: string[];
  pauseReason: string | null;
};

export const EMPTY_FILTER_RUNTIME_STATUS: FilterRuntimeStatus = {
  roomId: null,
  pausedFanMedalRuleIds: [],
  pauseReason: null,
};
