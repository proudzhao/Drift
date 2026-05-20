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
  return (
    <div className="settings-page diagnostics-page">
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
      {apiTestError ? <p className="control-error">{apiTestError}</p> : null}
      {apiTestSteps.length > 0 ? (
        <div className="api-test-list">
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
