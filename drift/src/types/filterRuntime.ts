export type RoomFilterRuntimeStatus = {
  roomId: number;
  pausedFanMedalRuleIds: string[];
  pauseReason: string | null;
};

export type FilterRuntimeStatus = {
  rooms: RoomFilterRuntimeStatus[];
};

export const EMPTY_FILTER_RUNTIME_STATUS: FilterRuntimeStatus = {
  rooms: [],
};
