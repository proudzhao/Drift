import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import iconUrl from "/icon.png";
import type { AppUpdateState } from "../../hooks/control/useAppUpdate";
import type { UpdateConfig } from "../../types/config";
import { Button, Toggle } from "../ui";

type AboutSettingsProps = {
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onLoadCurrentVersion: () => void;
  onRestartApp: () => void;
  onUpdateConfigChange: (update: Partial<UpdateConfig>) => void;
  updateState: AppUpdateState;
  updateConfig: UpdateConfig;
};

export function AboutSettings({
  onCheckUpdate,
  onInstallUpdate,
  onLoadCurrentVersion,
  onRestartApp,
  onUpdateConfigChange,
  updateState,
  updateConfig,
}: AboutSettingsProps) {
  const isBusy =
    updateState.status === "checking" ||
    updateState.status === "downloading" ||
    updateState.status === "installing";
  const progressPercent =
    updateState.totalBytes && updateState.totalBytes > 0
      ? Math.min(
          100,
          Math.round((updateState.downloadedBytes / updateState.totalBytes) * 100),
        )
      : null;
  const appVersion = updateState.currentVersion;
  const statusText = getUpdateStatusText(updateState, progressPercent);

  useEffect(() => {
    onLoadCurrentVersion();
  }, [onLoadCurrentVersion]);

  return (
    <div className="grid min-h-0 content-start gap-3.5 overflow-hidden">
      <div className="grid justify-items-center gap-1 pb-4 pt-6">
        <img
          alt="Drift"
          className="mb-2 size-[72px] rounded-2xl"
          src={iconUrl}
        />
        <strong className="text-lg font-bold text-[#202124]">Drift</strong>
        <span className="text-[13px] text-[#6f7782]">版本 {appVersion}</span>
        <p className="m-[2px_0_0] text-xs text-[#8e949a]">
          桌面弹幕悬浮工具
        </p>
      </div>

      <div className="flex justify-center gap-2">
        <Button
          className="px-6"
          disabled={isBusy}
          onClick={onCheckUpdate}
        >
          {getCheckButtonText(updateState.status)}
        </Button>
      </div>

      <div className="flex min-h-[30px] items-center justify-center gap-2.5 text-xs text-[#555d66]">
        <span>启动时自动检查更新</span>
        <Toggle
          aria-label="启动时自动检查更新"
          checked={updateConfig.checkOnStartup}
          onCheckedChange={(checked) =>
            onUpdateConfigChange({ checkOnStartup: checked })
          }
        />
      </div>

      {statusText ? (
        <div className="grid gap-2 rounded-[7px] border border-[#d8dde6] bg-white px-3 py-2 text-center shadow-drift-control">
          <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[#374151]">
            {statusText}
          </p>
          {updateState.status === "downloading" ? (
            <div className="grid gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#e5e7eb]">
                <div
                  className="h-full rounded-full bg-drift-primary transition-[width]"
                  style={{
                    width: progressPercent === null ? "35%" : `${progressPercent}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-[#6f7782]">
                {progressPercent === null
                  ? formatBytes(updateState.downloadedBytes)
                  : `${progressPercent}% · ${formatBytes(
                      updateState.downloadedBytes,
                    )} / ${formatBytes(updateState.totalBytes ?? 0)}`}
              </span>
            </div>
          ) : null}
          {updateState.notes ? (
            <p className="m-0 line-clamp-2 text-[10px] leading-4 text-[#6f7782]">
              {updateState.notes}
            </p>
          ) : null}
        </div>
      ) : null}

      {updateState.checkedAt ? (
        <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] text-[#6f7782]">
          最近检查：{formatCheckedAt(updateState.checkedAt)}
        </p>
      ) : null}

      {updateState.status === "available" ? (
        <div className="flex justify-center gap-2">
          <Button
            className="px-5"
            disabled={isBusy}
            onClick={onInstallUpdate}
            variant="primary"
          >
            下载并安装
          </Button>
          <Button
            className="px-5"
            onClick={() => openUrl(updateState.releaseUrl)}
          >
            前往 GitHub 下载
          </Button>
        </div>
      ) : null}

      {updateState.status === "error" ? (
        <div className="flex justify-center gap-2">
          <Button className="px-5" onClick={onCheckUpdate}>
            重试
          </Button>
          <Button
            className="px-5"
            onClick={() => openUrl(updateState.releaseUrl)}
          >
            前往 GitHub 下载
          </Button>
        </div>
      ) : null}

      {updateState.status === "installed" ? (
        <div className="flex justify-center gap-2">
          <Button className="px-5" onClick={onRestartApp} variant="primary">
            重启 Drift
          </Button>
          <Button
            className="px-5"
            onClick={() => openUrl(updateState.releaseUrl)}
          >
            查看发布页
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function getCheckButtonText(status: AppUpdateState["status"]) {
  if (status === "checking") return "检查中";
  if (status === "not_available" || status === "error") return "重新检查";
  return "检查更新";
}

function getUpdateStatusText(
  updateState: AppUpdateState,
  progressPercent: number | null,
) {
  if (updateState.status === "idle") return "";
  if (updateState.status === "checking") return "正在检查更新";
  if (updateState.status === "not_available") return "已是最新版本";
  if (updateState.status === "available") {
    return `发现新版本 ${updateState.latestVersion}`;
  }
  if (updateState.status === "downloading") {
    return progressPercent === null
      ? "正在下载更新"
      : `正在下载更新 ${progressPercent}%`;
  }
  if (updateState.status === "installing") return "正在安装更新";
  if (updateState.status === "installed") return "安装完成，重启后生效";
  return updateState.error || "更新失败";
}

function formatCheckedAt(checkedAt?: number) {
  if (checkedAt) return new Date(checkedAt).toLocaleString();
  return "尚未检查";
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
