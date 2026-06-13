import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { classNames } from "../../utils/classNames";
import { Button, Toggle } from "../ui";

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
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] content-stretch gap-3 overflow-hidden">
      <fieldset className="m-[6px_0_0] grid gap-2.5 rounded-sm border border-[#d1d1d1] bg-[#e7e7e7] px-[18px] pb-3.5 pt-4">
        <legend className="px-2 text-[11px] font-semibold text-[#333333]">
          开发者工具
        </legend>
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[#1f1f1f]">
            Mock 弹幕
          </span>
          <Toggle
            aria-label="Mock 弹幕"
            checked={mockPanelEnabled}
            onCheckedChange={onMockPanelToggle}
          />
        </div>
        <p className="m-0 text-[11px] text-[#6f7782]">
          启用后可在编辑模式下生成模拟弹幕，用于测试渲染效果
        </p>
      </fieldset>

      <fieldset className="m-[6px_0_0] grid min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-sm border border-[#d1d1d1] bg-[#e7e7e7] px-[18px] pb-3.5 pt-4">
        <legend className="px-2 text-[11px] font-semibold text-[#333333]">
          API 诊断
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={isApiTesting || !draftRoomId.trim()}
            onClick={onTestApi}
          >
            {isApiTesting ? "测试中" : "测试 API"}
          </Button>
          <Button onClick={() => invoke("open_log_dir")}>
            打开日志目录
          </Button>
        </div>

        <div className="grid w-[min(160px,100%)]">
          <Button disabled={isExporting} onClick={exportDiagnostics}>
            {isExporting ? "导出中" : "导出诊断包"}
          </Button>
        </div>

        {exportMessage ? (
          <p className="m-0 text-[11px] text-[#6f7782]">
            {exportMessage}
          </p>
        ) : null}

        {apiTestError ? (
          <p className="m-0 text-[11px] leading-snug text-[#b45f06]">
            {apiTestError}
          </p>
        ) : null}
        {apiTestSteps.length > 0 ? (
          <div className="settings-scroll-list grid min-h-0 content-start gap-2 overflow-y-auto">
            {apiTestSteps.map((step) => {
              const isExpanded = expandedApiStepKey === step.key;

              return (
                <button
                  className="grid w-full cursor-pointer appearance-none grid-cols-[26px_minmax(0,1fr)] gap-2 rounded-md border border-[#d5d5d5] bg-[#f5f5f5] p-2 text-left font-[inherit] text-inherit hover:border-[#c4c4c4] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a84ff]/45"
                  key={step.key}
                  onClick={() =>
                    onExpandedApiStepChange(isExpanded ? null : step.key)
                  }
                  type="button"
                >
                  <span
                    className={classNames(
                      "grid size-[22px] place-items-center rounded-full text-[9px] font-bold",
                      apiTestMarkClassName(step.status),
                    )}
                  >
                    {apiTestMark(step.status)}
                  </span>
                  <div>
                    <div className="flex items-baseline justify-between gap-2.5">
                      <strong className="text-[11px] font-semibold text-[#202124]">
                        {step.label}
                      </strong>
                      <span className="text-[10px] text-[#7b8490]">
                        {step.durationMs} ms
                      </span>
                    </div>
                    <p className="mb-0.5 mt-1 text-[11px] text-[#606873]">
                      {step.message}
                    </p>
                    <small
                      className={classNames(
                        "block text-[10px] text-[#7b8490]",
                        isExpanded
                          ? "whitespace-pre-wrap break-words"
                          : "overflow-hidden text-ellipsis whitespace-nowrap",
                      )}
                    >
                      {step.detail}
                    </small>
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

function apiTestMarkClassName(status: ApiTestStep["status"]) {
  switch (status) {
    case "success":
      return "bg-[#34c759]/15 text-[#248a3d]";
    case "warning":
    case "failed":
      return "bg-[#ff9500]/15 text-[#b45f06]";
    default:
      return "bg-[#e6e6e6] text-[#555d66]";
  }
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
