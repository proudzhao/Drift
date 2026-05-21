import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import iconUrl from "/icon.png";

type AppVersion = {
  version: string;
};

type CheckUpdateResult = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  error: string | null;
};

export function AboutSettings() {
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
          disabled={isCheckingUpdate}
          onClick={checkUpdate}
          type="button"
        >
          {isCheckingUpdate ? "检查中" : "检查更新"}
        </button>
      </div>

      {updateResult ? (
        <p className="control-status" style={{ margin: 0, textAlign: "center" }}>
          {updateResult.error
            ? updateResult.error
            : updateResult.hasUpdate
              ? "发现新版本 " + updateResult.latestVersion
              : "已是最新版本"}
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
