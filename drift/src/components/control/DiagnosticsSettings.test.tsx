import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { DiagnosticsSettings } from "./DiagnosticsSettings";

afterEach(clearMocks);

const TEST_STEP = {
  key: "room-init",
  label: "room_init",
  status: "success" as const,
  durationMs: 12,
  message: "通过",
  detail: "detail",
};

test("keeps diagnostics commands and expandable steps", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "export_diagnostics") return "drift-diagnostics.txt";
    return null;
  });
  const user = userEvent.setup();
  const onExpandedApiStepChange = vi.fn();
  const onMockPanelToggle = vi.fn();
  const onTestApi = vi.fn();

  render(
    <DiagnosticsSettings
      apiTestError=""
      apiTestSteps={[TEST_STEP]}
      draftRoomId="123456"
      expandedApiStepKey={null}
      isApiTesting={false}
      mockPanelEnabled={false}
      onExpandedApiStepChange={onExpandedApiStepChange}
      onMockPanelToggle={onMockPanelToggle}
      onTestApi={onTestApi}
    />,
  );

  await user.click(screen.getByRole("switch", { name: "Mock 弹幕" }));
  await user.click(screen.getByRole("button", { name: "测试 API" }));
  await user.click(screen.getByRole("button", { name: "打开日志目录" }));
  await user.click(screen.getByRole("button", { name: "导出诊断包" }));
  await user.click(screen.getByRole("button", { name: /room_init/ }));

  expect(calls).toContainEqual({ command: "open_log_dir", payload: {} });
  expect(calls).toContainEqual({ command: "export_diagnostics", payload: {} });
  expect(await screen.findByText("已导出：drift-diagnostics.txt")).toBeVisible();
  expect(onMockPanelToggle).toHaveBeenCalledWith(true);
  expect(onTestApi).toHaveBeenCalledOnce();
  expect(onExpandedApiStepChange).toHaveBeenCalledWith("room-init");
  expect(screen.getByRole("region", { name: "开发者工具" })).toBeVisible();
  expect(screen.getByRole("region", { name: "API 诊断" })).toBeVisible();
  expect(screen.getByText("12 ms")).toHaveClass("drift-data-text");
  expect(screen.getByText("成功")).toBeVisible();
});

test("keeps export failure visible and restores the export action", async () => {
  mockIPC((command) => {
    if (command === "export_diagnostics") {
      throw new Error("磁盘不可写");
    }
    return null;
  });
  const user = userEvent.setup();

  render(
    <DiagnosticsSettings
      apiTestError=""
      apiTestSteps={[]}
      draftRoomId="123456"
      expandedApiStepKey={null}
      isApiTesting={false}
      mockPanelEnabled={false}
      onExpandedApiStepChange={vi.fn()}
      onMockPanelToggle={vi.fn()}
      onTestApi={vi.fn()}
    />,
  );

  const exportButton = screen.getByRole("button", { name: "导出诊断包" });
  await user.click(exportButton);

  expect(
    await screen.findByText("导出失败：Error: 磁盘不可写"),
  ).toBeVisible();
  expect(exportButton).toBeEnabled();
});
