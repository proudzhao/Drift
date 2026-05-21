import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ApiTestStep = {
  key: string;
  label: string;
  status: "success" | "warning" | "failed";
  durationMs: number;
  message: string;
  detail: string;
};

type DiagnosticsSettingsProps = {
  apiTestError: string;
  apiTestSteps: ApiTestStep[];
  draftRoomId: string;
  expandedApiStepKey: string | null;
  isApiTesting: boolean;
  mockPanelEnabled: boolean;
  onExpandedApiStepChange: (stepKey: string | null) => void;
  onMockPanelToggle: (enabled: boolean) => void;
  onTestApi: () => void;
};

export function DiagnosticsSettings({
  apiTestError,
  apiTestSteps,
  draftRoomId,
  expandedApiStepKey,
  isApiTesting,
  mockPanelEnabled,
  onExpandedApiStepChange,
  onMockPanelToggle,
  onTestApi,
}: DiagnosticsSettingsProps) {
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

  return (
    <div className="settings-page diagnostics-settings">
      <fieldset className="settings-group">
        <legend>开发者工具</legend>
        <div className="toggle-row">
          <span>Mock 弹幕</span>
          <input
            checked={mockPanelEnabled}
            onChange={(event) => onMockPanelToggle(event.target.checked)}
            type="checkbox"
          />
        </div>
        <p className="control-status" style={{ margin: 0 }}>
          启用后可在编辑模式下生成模拟弹幕，用于测试渲染效果
        </p>
      </fieldset>

      <fieldset className="settings-group">
        <legend>API 诊断</legend>
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

        <div className="settings-actions">
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
      </fieldset>
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
