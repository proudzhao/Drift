import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export type ApiTestStep = {
  key: string;
  label: string;
  status: "success" | "warning" | "failed";
  durationMs: number;
  message: string;
  detail: string;
};

type CheckUpdateResult = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  error: string | null;
};

type DiagnosticsSettingsProps = {
  apiTestError: string;
  apiTestSteps: ApiTestStep[];
  draftRoomId: string;
  expandedApiStepKey: string | null;
  isApiTesting: boolean;
  onExpandedApiStepChange: (stepKey: string | null) => void;
  onTestApi: () => void;
};

export function DiagnosticsSettings({
  apiTestError,
  apiTestSteps,
  draftRoomId,
  expandedApiStepKey,
  isApiTesting,
  onExpandedApiStepChange,
  onTestApi,
}: DiagnosticsSettingsProps) {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<CheckUpdateResult | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  async function exportDiagnostics() {
    setIsExporting(true);
    setExportMessage("");

    try {
      const filename = await invoke<string>("export_diagnostics");
      setExportMessage(`已导出：${filename}`);
    } catch (error) {
      setExportMessage(`导出失败：${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }

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
    <div className="settings-page diagnostics-settings">
      <div className="settings-actions">
        <button
          disabled={isApiTesting || !draftRoomId.trim()}
          onClick={onTestApi}
          type="button"
        >
          {isApiTesting ? "测试中" : "测试 API"}
        </button>
        <button onClick={() => invoke("open_log_dir")} type="button">
          打开日志目录
        </button>
      </div>

      <div className="settings-actions single-action">
        <button
          disabled={isExporting}
          onClick={exportDiagnostics}
          type="button"
        >
          {isExporting ? "导出中" : "导出诊断包"}
        </button>
      </div>

      {exportMessage ? (
        <p className="control-status" style={{ margin: 0 }}>
          {exportMessage}
        </p>
      ) : null}

      <div className="settings-actions single-action">
        <button
          disabled={isCheckingUpdate}
          onClick={checkUpdate}
          type="button"
        >
          {isCheckingUpdate ? "检查中" : "检查更新"}
        </button>
      </div>

      {updateResult ? (
        <p
          className={`control-status${updateResult.hasUpdate ? " has-update" : ""}`}
          style={{ margin: 0 }}
        >
          {updateResult.error
            ? `检查更新失败：${updateResult.error}`
            : updateResult.hasUpdate
              ? `发现新版本 ${updateResult.latestVersion}（当前 ${updateResult.currentVersion}）`
              : `已是最新版本 ${updateResult.currentVersion}`}
        </p>
      ) : null}
      {updateResult?.hasUpdate && updateResult.releaseUrl ? (
        <div className="settings-actions single-action">
          <button
            onClick={() => openUrl(updateResult.releaseUrl)}
            type="button"
          >
            前往下载
          </button>
        </div>
      ) : null}

      {apiTestError ? <p className="control-error">{apiTestError}</p> : null}
      {apiTestSteps.length > 0 ? (
        <div className="api-test-list settings-scroll-list">
          {apiTestSteps.map((step) => {
            const isExpanded = expandedApiStepKey === step.key;

            return (
              <button
                className="api-test-item"
                data-expanded={isExpanded}
                data-status={step.status}
                key={step.key}
                onClick={() =>
                  onExpandedApiStepChange(isExpanded ? null : step.key)
                }
                type="button"
              >
                <span className="api-test-mark">{apiTestMark(step.status)}</span>
                <div>
                  <div className="api-test-title">
                    <strong>{step.label}</strong>
                    <span>{step.durationMs} ms</span>
                  </div>
                  <p>{step.message}</p>
                  <small>{step.detail}</small>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function apiTestMark(status: ApiTestStep["status"]) {
  switch (status) {
    case "success":
      return "OK";
    case "warning":
      return "!";
    case "failed":
    default:
      return "X";
  }
}
