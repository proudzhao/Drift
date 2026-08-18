import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { classNames } from "../../utils/classNames";
import { Button, Toggle } from "../ui";
import {
  DataValue,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  StatusDot,
} from "./settings-ui";

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
    <SettingsPage>
      <SettingsSection
        description="只影响当前运行会话中的测试入口"
        title="开发者工具"
      >
        <SettingsRow
          control={
            <Toggle
              aria-label="Mock 弹幕"
              checked={mockPanelEnabled}
              onCheckedChange={onMockPanelToggle}
            />
          }
          description="启用后可在编辑模式下生成模拟弹幕，用于测试渲染效果"
          label="Mock 弹幕"
        />
      </SettingsSection>

      <SettingsSection
        description="检查当前直播间的真实连接链路"
        title="API 诊断"
      >
        <SettingsRow
          control={
            <DataValue>{draftRoomId.trim() || "未填写"}</DataValue>
          }
          description="测试将使用此房间号"
          label="直播间"
        />
        <SettingsRow
          control={
            <div className="flex max-w-full flex-wrap justify-end gap-2">
              <Button
                disabled={isApiTesting || !draftRoomId.trim()}
                onClick={onTestApi}
              >
                {isApiTesting ? "测试中" : "测试 API"}
              </Button>
              <Button onClick={() => invoke("open_log_dir")}>
                打开日志目录
              </Button>
              <Button disabled={isExporting} onClick={exportDiagnostics}>
                {isExporting ? "导出中" : "导出诊断包"}
              </Button>
            </div>
          }
          description="日志目录和诊断报告仅保存在本机"
          label="操作"
        />

        {apiTestSteps.length > 0 ? (
          <div className="settings-scroll-list grid content-start gap-2 border-t border-drift-line p-2">
            {apiTestSteps.map((step) => {
              const isExpanded = expandedApiStepKey === step.key;

              return (
                <button
                  className="grid w-full min-w-0 cursor-pointer appearance-none grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-drift-line bg-[#0d191e] p-2 text-left font-[inherit] text-inherit transition-colors hover:border-[#36515a] hover:bg-drift-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-signal/30"
                  key={step.key}
                  onClick={() =>
                    onExpandedApiStepChange(isExpanded ? null : step.key)
                  }
                  type="button"
                >
                  <div className="min-w-0">
                    <strong className="text-[11px] font-semibold text-drift-ink">
                      {step.label}
                    </strong>
                    <p className="mb-0.5 mt-1 text-[10px] text-[#9db4ba]">
                      {step.message}
                    </p>
                    <small
                      className={classNames(
                        "block text-[9px] leading-4 text-[#6f878e]",
                        isExpanded
                          ? "whitespace-pre-wrap break-words"
                          : "overflow-hidden text-ellipsis whitespace-nowrap",
                      )}
                    >
                      {step.detail}
                    </small>
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-1">
                    <StatusDot
                      label={apiTestMark(step.status)}
                      tone={apiTestTone(step.status)}
                    />
                    <DataValue>{step.durationMs} ms</DataValue>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </SettingsSection>

      {exportMessage ? (
        <StatusBanner
          description={exportMessage}
          title={exportMessage.startsWith("导出失败：") ? "诊断导出失败" : "诊断导出完成"}
          tone={exportMessage.startsWith("导出失败：") ? "danger" : "success"}
        />
      ) : null}

      {apiTestError ? (
        <StatusBanner
          description={apiTestError}
          title="API 诊断失败"
          tone="danger"
        />
      ) : null}
    </SettingsPage>
  );
}

function apiTestTone(status: ApiTestStep["status"]) {
  switch (status) {
    case "success":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function apiTestMark(status: ApiTestStep["status"]) {
  switch (status) {
    case "success":
      return "成功";
    case "warning":
      return "警告";
    case "failed":
    default:
      return "失败";
  }
}
