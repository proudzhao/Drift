import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ControlUpdateNotice } from "./ControlUpdateNotice";

test("keeps updater actions available in the compact notice", () => {
  render(
    <ControlUpdateNotice
      onDismiss={vi.fn()}
      onInstall={vi.fn()}
      onOpenRelease={vi.fn()}
      onRestart={vi.fn()}
      onShowDetails={vi.fn()}
      progressPercent={null}
      updateState={{
        status: "available",
        currentVersion: "0.7.0",
        latestVersion: "0.7.1",
        releaseUrl: "https://github.com/proudzhao/Drift/releases/latest",
        notes: "",
        downloadedBytes: 0,
        error: "",
      }}
    />,
  );

  expect(screen.getByText("发现新版本 0.7.1")).toBeVisible();
  expect(screen.getByRole("button", { name: "下载并安装" })).toBeVisible();
  expect(screen.getByRole("button", { name: "GitHub" })).toBeVisible();
  expect(screen.getByRole("button", { name: "查看详情" })).toBeVisible();
});
