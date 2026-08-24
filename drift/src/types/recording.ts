export type DanmakuRecordingStatus = {
  enabled: boolean;
  state: "disabled" | "waiting" | "recording" | "error";
  currentFileName: string | null;
  errorMessage: string | null;
};

export const EMPTY_DANMAKU_RECORDING_STATUS: DanmakuRecordingStatus = {
  enabled: false,
  state: "disabled",
  currentFileName: null,
  errorMessage: null,
};
