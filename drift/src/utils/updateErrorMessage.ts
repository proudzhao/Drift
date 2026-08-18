export type UpdateErrorStage = "check" | "download_install" | "restart";

const UPDATE_ERROR_MESSAGES: Record<UpdateErrorStage, string> = {
  check: "暂时无法获取更新信息，请稍后重试。",
  download_install: "更新下载或安装失败，请重试或前往 GitHub 下载。",
  restart: "无法自动重启 Drift，请手动重启应用。",
};

export function getUpdateErrorMessage(stage: UpdateErrorStage) {
  return UPDATE_ERROR_MESSAGES[stage];
}
