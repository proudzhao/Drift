import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import iconUrl from "/icon.png";
import type { UpdateConfig } from "../../types/config";
import { Button, Toggle } from "../ui";

type AppVersion = {
  version: string;
};

export type CheckUpdateResult = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  error: string | null;
};

export type CachedUpdateResult = {
  result: CheckUpdateResult | null;
  checkedAt?: number;
  isChecking: boolean;
};

type AboutSettingsProps = {
  cachedUpdate: CachedUpdateResult | null;
  onUpdateConfigChange: (update: Partial<UpdateConfig>) => void;
  updateConfig: UpdateConfig;
};

export function AboutSettings({
  cachedUpdate,
  onUpdateConfigChange,
  updateConfig,
}: AboutSettingsProps) {
  const [appVersion, setAppVersion] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<CheckUpdateResult | null>(
    null,
  );

  useEffect(() => {
    invoke<AppVersion>("get_app_version")
      .then((result) => setAppVersion(result.version))
      .catch(() => setAppVersion(""));
  }, []);

  useEffect(() => {
    if (cachedUpdate?.result) {
      setUpdateResult(cachedUpdate.result);
    }
  }, [cachedUpdate?.result]);

  async function checkUpdate() {
    setIsCheckingUpdate(true);
    setUpdateResult(null);

    try {
      const result = await invoke<CheckUpdateResult>("check_update");
      setUpdateResult(result);
    } catch (error) {
      setUpdateResult({
        hasUpdate: false,
        currentVersion: "",
        latestVersion: "",
        releaseUrl: "",
        error: String(error),
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }

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
          disabled={isCheckingUpdate || Boolean(cachedUpdate?.isChecking)}
          onClick={checkUpdate}
        >
          {isCheckingUpdate || cachedUpdate?.isChecking ? "检查中" : "检查更新"}
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

      {updateResult ? (
        <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] text-[#6f7782]">
          {updateResult.error
            ? updateResult.error
            : updateResult.hasUpdate
              ? "发现新版本 " + updateResult.latestVersion
              : "已是最新版本"}
        </p>
      ) : null}

      {cachedUpdate?.checkedAt ? (
        <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] text-[#6f7782]">
          最近检查：{formatUnixTime(cachedUpdate.checkedAt)}
        </p>
      ) : null}

      {updateResult?.hasUpdate && updateResult.releaseUrl ? (
        <div className="flex justify-center gap-2">
          <Button
            className="px-6"
            onClick={() => openUrl(updateResult.releaseUrl)}
            variant="primary"
          >
            前往下载
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatUnixTime(value?: number) {
  if (!value) return "尚未检查";
  return new Date(value * 1000).toLocaleString();
}
