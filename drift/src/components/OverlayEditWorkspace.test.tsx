import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import overlayCss from "../styles/tailwind.css?raw";
import { createEmptyStatsSnapshot } from "../utils/danmakuStats";
import { OverlayEditWorkspace } from "./OverlayEditWorkspace";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function props(
  overrides: Partial<ComponentProps<typeof OverlayEditWorkspace>> = {},
) {
  return {
    historyMessages: [],
    mock: null,
    onDragStart: vi.fn(),
    onExit: vi.fn(),
    onResizeStart: vi.fn(),
    onShowMock: vi.fn(),
    onToggleHistory: vi.fn(),
    onToggleStats: vi.fn(),
    shortcut: "Command+Option+K",
    showHistory: false,
    showStats: false,
    stats: createEmptyStatsSnapshot(1),
    ...overrides,
  } satisfies ComponentProps<typeof OverlayEditWorkspace>;
}

test("renders the scoped workspace without mock when disabled", () => {
  render(<OverlayEditWorkspace {...props()} />);

  expect(screen.getByLabelText("弹幕编辑工作台")).toHaveClass(
    "drift-overlay-workspace",
  );
  expect(screen.queryByLabelText("Mock 弹幕控制")).not.toBeInTheDocument();
  expect(screen.queryByText("Mock")).not.toBeInTheDocument();
});

test("forwards drag and four resize directions", () => {
  const onResizeStart = vi.fn();
  const viewProps = props({ onResizeStart });
  render(<OverlayEditWorkspace {...viewProps} />);

  fireEvent.mouseDown(screen.getByLabelText("拖动弹幕窗口"), { button: 0 });
  for (const label of ["左上角", "右上角", "右下角", "左下角"]) {
    fireEvent.mouseDown(
      screen.getByRole("button", { name: `${label}缩放弹幕窗口` }),
      { button: 0 },
    );
  }

  expect(viewProps.onDragStart).toHaveBeenCalledOnce();
  expect(onResizeStart).toHaveBeenCalledTimes(4);
  expect(onResizeStart.mock.calls.map(([direction]) => direction)).toEqual(
    ["NorthWest", "NorthEast", "SouthEast", "SouthWest"],
  );
});

test("renders only the selected drawer and restores mock from narrow rail", async () => {
  const user = userEvent.setup();
  const viewProps = props({
    mock: {
      active: false,
      rate: 50,
      totalGenerated: 0,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onRateChange: vi.fn(),
      onBurst: vi.fn(),
    },
    showHistory: true,
  });
  render(<OverlayEditWorkspace {...viewProps} />);

  expect(
    screen.getByRole("complementary", { name: "弹幕历史" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("complementary", { name: "弹幕统计" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "编辑工作台" })).toHaveAttribute(
    "data-drawer-open",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "显示 Mock 控制" }));
  expect(viewProps.onShowMock).toHaveBeenCalledOnce();
});

test("uses icons with Chinese accessible names in the narrow mode rail", () => {
  render(
    <OverlayEditWorkspace
      {...props({
        mock: {
          active: false,
          rate: 50,
          totalGenerated: 0,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onRateChange: vi.fn(),
          onBurst: vi.fn(),
        },
        showStats: true,
      })}
    />,
  );

  const rail = screen.getByRole("navigation", { name: "窄屏工作台模式" });
  expect(rail.querySelectorAll("svg")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "显示 Mock 控制" })).toBeVisible();
  expect(screen.getByRole("button", { name: "显示弹幕历史" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "显示弹幕统计" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(within(rail).getByRole("button", { name: "完成编辑" })).toBeVisible();
});

test("keeps overlay CSS scoped with the 560/559 breakpoint contract", () => {
  expect(overlayCss).toContain(".drift-overlay-workspace {");
  expect(overlayCss).toContain(".drift-overlay-workspace,");
  expect(overlayCss).toContain(".drift-overlay-workspace * {");
  expect(overlayCss).toContain("box-sizing: border-box;");
  expect(overlayCss).toContain("@media (max-width: 559px)");
  expect(overlayCss).toContain(
    ".drift-overlay-workspace .overlay-mock-panel {\n    gap: 4px;\n    padding: 6px;",
  );
  expect(overlayCss).toContain('.overlay-control-dock[data-drawer-open="true"]');
  expect(overlayCss).toContain(".overlay-covered-on-narrow");
  expect(overlayCss).toContain(
    ".drift-overlay-workspace .overlay-narrow-rail .drift-button:focus-visible",
  );
  expect(overlayCss).toContain(
    '.drift-overlay-workspace .overlay-narrow-rail .drift-button[aria-pressed="true"]',
  );
  expect(overlayCss).toContain(
    ".drift-overlay-workspace .overlay-resize-handle:focus-visible",
  );
  expect(overlayCss).toContain(".drift-overlay-workspace *::before");
  expect(overlayCss).toContain(".drift-overlay-workspace *::after");
  expect(overlayCss).not.toContain(":has(");
});
