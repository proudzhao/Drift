import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import iconUrl from "/icon.png";
import type { UpdateConfig } from "../../types/config";

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
    <div className="settings-page">
      <div className="about-section">
        <img alt="Drift" className="about-icon" src={iconUrl} />
        <strong className="about-app-name">Drift</strong>
        <span className="about-version">版本 {appVersion}</span>
        <p className="about-desc">桌面弹幕悬浮工具</p>
      </div>

      <div className="about-actions">
        <button
          disabled={isCheckingUpdate || Boolean(cachedUpdate?.isChecking)}
          onClick={checkUpdate}
          type="button"
        >
          {isCheckingUpdate || cachedUpdate?.isChecking ? "检查中" : "检查更新"}
        </button>
      </div>

      <label className="about-toggle">
        <span>启动时自动检查更新</span>
        <input
          checked={updateConfig.checkOnStartup}
          onChange={(event) =>
            onUpdateConfigChange({ checkOnStartup: event.currentTarget.checked })
          }
          type="checkbox"
        />
      </label>

      {updateResult ? (
        <p className="control-status" style={{ margin: 0, textAlign: "center" }}>
          {updateResult.error
            ? updateResult.error
            : updateResult.hasUpdate
              ? "发现新版本 " + updateResult.latestVersion
              : "已是最新版本"}
        </p>
      ) : null}

      {cachedUpdate?.checkedAt ? (
        <p className="control-status" style={{ margin: 0, textAlign: "center" }}>
          最近检查：{formatUnixTime(cachedUpdate.checkedAt)}
        </p>
      ) : null}

      {updateResult?.hasUpdate && updateResult.releaseUrl ? (
        <div className="about-actions">
          <button
            onClick={() => openUrl(updateResult.releaseUrl)}
            type="button"
          >
            前往下载
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatUnixTime(value?: number) {
  if (!value) return "尚未检查";
  return new Date(value * 1000).toLocaleString();
}
