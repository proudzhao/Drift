import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import iconUrl from "/icon.png";
import type { AppUpdateState } from "../../hooks/control/useAppUpdate";
import type { UpdateConfig } from "../../types/config";
import { Button, Toggle } from "../ui";
import {
  DataValue,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  type StatusTone,
} from "./settings-ui";

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
  const statusActions =
    updateState.status === "available" ? (
      <>
        <Button
          disabled={isBusy}
          onClick={onInstallUpdate}
          variant="primary"
        >
          下载并安装
        </Button>
        <Button onClick={() => openUrl(updateState.releaseUrl)}>
          前往 GitHub 下载
        </Button>
      </>
    ) : updateState.status === "error" ? (
      <>
        <Button onClick={onCheckUpdate}>重试</Button>
        <Button onClick={() => openUrl(updateState.releaseUrl)}>
          前往 GitHub 下载
        </Button>
      </>
    ) : updateState.status === "installed" ? (
      <>
        <Button onClick={onRestartApp} variant="primary">
          重启 Drift
        </Button>
        <Button onClick={() => openUrl(updateState.releaseUrl)}>
          查看发布页
        </Button>
      </>
    ) : undefined;

  useEffect(() => {
    onLoadCurrentVersion();
  }, [onLoadCurrentVersion]);

  return (
    <SettingsPage>
      <SettingsSection title="产品">
        <div className="grid justify-items-center gap-1 px-4 py-5 text-center">
          <img
            alt="Drift"
            className="mb-2 size-[72px] rounded-2xl"
            src={iconUrl}
          />
          <strong className="text-base font-bold text-drift-ink">Drift</strong>
          <p className="m-0 text-[10px] text-[#789097]">
            桌面弹幕悬浮工具
          </p>
          <div className="mt-1 inline-flex min-w-0 items-center gap-1.5">
            <span className="text-[9px] text-[#60777e]">版本</span>
            <DataValue>{appVersion || "未知"}</DataValue>
          </div>
          <Button
            className="mt-2"
            onClick={() => openUrl(updateState.releaseUrl)}
            size="sm"
            variant="ghost"
          >
            GitHub Releases
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        description="更新只在你确认后下载和安装"
        title="更新设置"
      >
        <SettingsRow
          control={
            <Button disabled={isBusy} onClick={onCheckUpdate}>
              {getCheckButtonText(updateState.status)}
            </Button>
          }
          description="从 GitHub Releases 检查最新版本"
          label="检查更新"
        />
        <SettingsRow
          control={
            <Toggle
              aria-label="启动时自动检查更新"
              checked={updateConfig.checkOnStartup}
              onCheckedChange={(checked) =>
                onUpdateConfigChange({ checkOnStartup: checked })
              }
            />
          }
          description="启动后静默检查，不会自动安装"
          label="自动检查"
        />
        {updateState.checkedAt ? (
          <SettingsRow
            control={
              <DataValue>{formatCheckedAt(updateState.checkedAt)}</DataValue>
            }
            label="最近检查"
          />
        ) : null}
      </SettingsSection>

      {statusText ? (
        <StatusBanner
          actions={statusActions}
          title={statusText}
          tone={updateStatusTone(updateState.status)}
        />
      ) : null}

      {updateState.status === "downloading" || updateState.notes ? (
        <SettingsSection
          title={
            updateState.status === "downloading" ? "下载进度" : "发布说明"
          }
        >
          {updateState.status === "downloading" ? (
            <div className="grid gap-2 px-3 py-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-drift-line">
                <div
                  className="h-full rounded-full bg-drift-signal transition-[width]"
                  style={{
                    width:
                      progressPercent === null
                        ? "35%"
                        : `${progressPercent}%`,
                  }}
                />
              </div>
              <DataValue>
                {progressPercent === null
                  ? formatBytes(updateState.downloadedBytes)
                  : `${progressPercent}% · ${formatBytes(
                      updateState.downloadedBytes,
                    )} / ${formatBytes(updateState.totalBytes ?? 0)}`}
              </DataValue>
            </div>
          ) : null}
          {updateState.notes ? (
            <p className="m-0 line-clamp-2 border-t border-drift-line px-3 py-2 text-[9px] leading-4 text-[#789097] first:border-t-0">
              {updateState.notes}
            </p>
          ) : null}
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

function updateStatusTone(status: AppUpdateState["status"]): StatusTone {
  if (status === "error") return "danger";
  if (status === "installed" || status === "not_available") return "success";
  if (
    status === "checking" ||
    status === "available" ||
    status === "downloading" ||
    status === "installing"
  ) {
    return "signal";
  }
  return "neutral";
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
