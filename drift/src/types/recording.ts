export type DanmakuRecordingFile = {
  roomId: number;
  fileName: string;
};

export type DanmakuRecordingStatus = {
  enabled: boolean;
  state: "disabled" | "waiting" | "recording" | "error";
  activeFiles: DanmakuRecordingFile[];
  errorMessage: string | null;
};

export const EMPTY_DANMAKU_RECORDING_STATUS: DanmakuRecordingStatus = {
  enabled: false,
  state: "disabled",
  activeFiles: [],
  errorMessage: null,
};
