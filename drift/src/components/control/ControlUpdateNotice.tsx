import type { AppUpdateState } from "../../hooks/control/useAppUpdate";
import { Button } from "../ui";

type ControlUpdateNoticeProps = {
  onDismiss: () => void;
  onInstall: () => void;
  onOpenRelease: () => void;
  onRestart: () => void;
  onShowDetails: () => void;
  progressPercent: number | null;
  updateState: AppUpdateState;
};

export function ControlUpdateNotice(props: ControlUpdateNoticeProps) {
  const { progressPercent, updateState } = props;
  const text = getUpdateNoticeText(updateState, progressPercent);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-3 border-b border-[#20404a] bg-[#0d1c21] px-4 py-2" role="status">
      <div className="grid min-w-0 gap-1">
        <strong className="truncate text-[10px] text-[#bdeff5]">
          {text.title}
        </strong>
        <span className="truncate text-[9px] text-[#789097]">
          {text.description}
        </span>
        {updateState.status === "downloading" ? (
          <div className="h-1 overflow-hidden rounded-full bg-drift-line">
            <div
              className="h-full rounded-full bg-drift-signal transition-[width] duration-[160ms]"
              style={{ width: progressPercent === null ? "35%" : `${progressPercent}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {updateState.status === "available" ? (
          <Button onClick={props.onInstall} size="sm" variant="primary">下载并安装</Button>
        ) : null}
        {updateState.status === "installed" ? (
          <Button onClick={props.onRestart} size="sm" variant="primary">重启 Drift</Button>
        ) : null}
        {updateState.status === "available" ? (
          <Button onClick={props.onOpenRelease} size="sm">GitHub</Button>
        ) : null}
        <Button onClick={props.onShowDetails} size="sm">查看详情</Button>
        {updateState.status === "available" ? (
          <Button aria-label="稍后提醒" onClick={props.onDismiss} size="sm" variant="ghost">稍后</Button>
        ) : null}
      </div>
    </div>
  );
}

function getUpdateNoticeText(
  updateState: AppUpdateState,
  progressPercent: number | null,
) {
  if (updateState.status === "downloading") {
    return {
      title:
        progressPercent === null
          ? "正在下载更新"
          : `正在下载更新 ${progressPercent}%`,
      description:
        progressPercent === null
          ? `已下载 ${formatBytes(updateState.downloadedBytes)}`
          : `${formatBytes(updateState.downloadedBytes)} / ${formatBytes(
              updateState.totalBytes ?? 0,
            )}`,
    };
  }

  if (updateState.status === "installing") {
    return {
      title: "正在安装更新",
      description: "安装过程中请不要关闭 Drift。",
    };
  }

  if (updateState.status === "installed") {
    return {
      title: "安装完成，重启后生效",
      description: "重启 Drift 后即可使用新版本。",
    };
  }

  return {
    title: `发现新版本 ${updateState.latestVersion}`,
    description: `当前版本 ${updateState.currentVersion || "未知"}，可在应用内下载并安装。`,
  };
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
