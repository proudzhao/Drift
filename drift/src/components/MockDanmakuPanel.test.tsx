import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MockDanmakuPanel } from "./MockDanmakuPanel";

test("keeps its left panel layout marker and optional workspace class", () => {
  render(
    <MockDanmakuPanel
      active={false}
      className="overlay-covered-on-narrow"
      rate={50}
      totalGenerated={0}
      onStart={vi.fn()}
      onStop={vi.fn()}
      onBurst={vi.fn()}
      onRateChange={vi.fn()}
    />,
  );

  expect(screen.getByLabelText("Mock 弹幕控制")).toHaveClass(
    "overlay-mock-panel",
    "absolute",
    "bottom-14",
    "left-3",
    "pointer-events-auto",
    "box-border",
    "overlay-covered-on-narrow",
  );
});

test("keeps start, burst and rate callbacks", async () => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  const onBurst = vi.fn();
  const onRateChange = vi.fn();
  render(
    <MockDanmakuPanel
      active={false}
      rate={50}
      totalGenerated={0}
      onStart={onStart}
      onStop={vi.fn()}
      onBurst={onBurst}
      onRateChange={onRateChange}
    />,
  );

  await user.click(screen.getByRole("button", { name: "启动 Mock" }));
  await user.click(screen.getByRole("button", { name: "模拟弹幕爆发" }));
  fireEvent.change(screen.getByRole("slider", { name: "Mock 弹幕速率" }), {
    target: { value: "75" },
  });
  expect(onStart).toHaveBeenCalledOnce();
  expect(onBurst).toHaveBeenCalledOnce();
  expect(onRateChange).toHaveBeenCalledWith(75);
  expect(screen.getByRole("slider", { name: "Mock 弹幕速率" })).toHaveAttribute(
    "min",
    "5",
  );
  expect(screen.getByRole("slider", { name: "Mock 弹幕速率" })).toHaveAttribute(
    "max",
    "200",
  );
  expect(screen.getByRole("slider", { name: "Mock 弹幕速率" })).toHaveAttribute(
    "step",
    "5",
  );
});

test("forwards the stop callback when Mock is active", async () => {
  const user = userEvent.setup();
  const onStop = vi.fn();
  render(
    <MockDanmakuPanel
      active
      rate={50}
      totalGenerated={1234}
      onStart={vi.fn()}
      onStop={onStop}
      onBurst={vi.fn()}
      onRateChange={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "停止 Mock" }));
  expect(onStop).toHaveBeenCalledOnce();
  expect(screen.getByText("已生成 1,234 条")).toBeVisible();
});
