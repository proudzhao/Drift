import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import overlayCss from "../styles/tailwind.css?raw";
import { createEmptyScopedStatsSnapshots } from "../utils/danmakuStats";
import controlDockSource from "./OverlayControlDock.tsx?raw";
import historyDrawerSource from "./DanmakuHistoryDrawer.tsx?raw";
import mockPanelSource from "./MockDanmakuPanel.tsx?raw";
import { OverlayEditWorkspace } from "./OverlayEditWorkspace";
import statsDrawerSource from "./DanmakuStatsDrawer.tsx?raw";

const DARK_OVERLAY_TOKENS: Record<string, string> = {
  "--drift-ui-overlay-control": "rgba(14, 29, 34, 0.88)",
  "--drift-ui-overlay-selected": "rgba(50, 199, 217, 0.16)",
  "--drift-ui-overlay-auxiliary": "#9db3b8",
  "--drift-ui-overlay-button-hover": "#182a31",
  "--drift-ui-overlay-control-hover": "#14272d",
  "--drift-ui-overlay-surface": "#0e1d22",
  "--drift-ui-overlay-divider": "#14272d",
  "--drift-ui-overlay-row-hover": "#10252b",
  "--drift-ui-overlay-copy-success": "#65d995",
  "--drift-ui-overlay-copy-danger": "#ff7d85",
  "--drift-ui-overlay-drag-glass": "rgba(7, 16, 20, 0.76)",
  "--drift-ui-overlay-glass": "rgba(7, 16, 20, 0.92)",
  "--drift-ui-overlay-drawer": "rgba(7, 16, 20, 0.95)",
  "--drift-ui-overlay-rail": "rgba(7, 16, 20, 0.97)",
  "--drift-ui-overlay-shadow": "rgba(0, 0, 0, 0.32)",
  "--drift-ui-overlay-dock-shadow": "rgba(0, 0, 0, 0.3)",
  "--drift-ui-overlay-scrollbar": "#36515a",
  "--drift-ui-overlay-track": "#162a31",
};

const LIGHT_OVERLAY_TOKENS: Record<string, string> = {
  "--drift-ui-overlay-control": "rgba(248, 251, 252, 0.88)",
  "--drift-ui-overlay-selected": "rgba(14, 153, 173, 0.16)",
  "--drift-ui-overlay-auxiliary": "#60777e",
  "--drift-ui-overlay-button-hover": "#e8f1f3",
  "--drift-ui-overlay-control-hover": "#e8f1f3",
  "--drift-ui-overlay-surface": "#f8fbfc",
  "--drift-ui-overlay-divider": "#d6e3e6",
  "--drift-ui-overlay-row-hover": "#e8f1f3",
  "--drift-ui-overlay-copy-success": "#167d50",
  "--drift-ui-overlay-copy-danger": "#b23f4d",
  "--drift-ui-overlay-drag-glass": "rgba(248, 251, 252, 0.76)",
  "--drift-ui-overlay-glass": "rgba(248, 251, 252, 0.92)",
  "--drift-ui-overlay-drawer": "rgba(255, 255, 255, 0.95)",
  "--drift-ui-overlay-rail": "rgba(255, 255, 255, 0.97)",
  "--drift-ui-overlay-shadow": "rgba(30, 67, 77, 0.16)",
  "--drift-ui-overlay-dock-shadow": "rgba(30, 67, 77, 0.14)",
  "--drift-ui-overlay-scrollbar": "#9fb9c0",
  "--drift-ui-overlay-track": "#d5e9ed",
};

function extractRuleBody(selector: string) {
  const ruleStart = overlayCss.indexOf(`${selector} {`);
  expect(ruleStart, `missing CSS rule for ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = overlayCss.indexOf("{", ruleStart) + 1;
  const bodyEnd = overlayCss.indexOf("\n}", bodyStart);
  expect(bodyEnd, `unterminated CSS rule for ${selector}`).toBeGreaterThan(bodyStart);
  return overlayCss.slice(bodyStart, bodyEnd);
}

function extractOverlayTokens(selector: string) {
  const body = extractRuleBody(selector);
  return Object.fromEntries(
    body
      .split("\n")
      .map((line) => line.trim().match(/^(--drift-ui-overlay-[\w-]+):\s*(.+);$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

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
    roomSources: [],
    shortcut: "Command+Option+K",
    showHistory: false,
    showStats: false,
    statsSnapshots: createEmptyScopedStatsSnapshots(1),
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

test("uses shared tokens for edit workspace chrome without light-only branches", () => {
  render(
    <OverlayEditWorkspace
      {...props({
        mock: {
          active: true,
          rate: 50,
          totalGenerated: 3,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onRateChange: vi.fn(),
          onBurst: vi.fn(),
        },
        showHistory: true,
      })}
    />,
  );

  expect(screen.getByRole("navigation", { name: "编辑工作台" })).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-glass)]",
    "text-[var(--drift-ui-ink)]",
  );
  expect(screen.getByLabelText("Mock 弹幕控制")).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-glass)]",
  );
  expect(screen.getByRole("complementary", { name: "弹幕历史" })).toHaveClass(
    "drift-theme-transition",
    "border-[var(--drift-ui-border)]",
    "bg-[var(--drift-ui-overlay-drawer)]",
  );
  expect(screen.getByRole("navigation", { name: "窄屏工作台模式" })).toHaveClass(
    "drift-theme-transition",
  );

  for (const source of [
    controlDockSource,
    historyDrawerSource,
    mockPanelSource,
    statsDrawerSource,
  ]) {
    expect(source).not.toMatch(/\b(?:driftTheme|lightTheme|isLight)\b/);
  }
});

test("defines exact dark baseline and Cyan Frost overlay tokens", () => {
  expect(extractOverlayTokens('html[data-drift-theme="dark"]')).toEqual(
    DARK_OVERLAY_TOKENS,
  );
  expect(extractOverlayTokens('html[data-drift-theme="light"]')).toEqual(
    LIGHT_OVERLAY_TOKENS,
  );
});

test("uses every overlay-specific token in edit chrome only", () => {
  const scopedCss = overlayCss.slice(
    overlayCss.indexOf(".drift-overlay-workspace,"),
  );
  const chromeSources = [
    controlDockSource,
    historyDrawerSource,
    mockPanelSource,
    statsDrawerSource,
    scopedCss,
  ].join("\n");

  for (const token of Object.keys(DARK_OVERLAY_TOKENS)) {
    expect(chromeSources, `unused overlay token ${token}`).toContain(token);
  }
});

test("themes drag, drawer, rail and resize chrome with paint-only tokens", () => {
  expect(overlayCss).toContain("color-scheme: inherit;");
  expect(overlayCss).toContain("background: var(--drift-ui-overlay-glass);");
  expect(overlayCss).toContain("background: var(--drift-ui-overlay-drawer);");
  expect(overlayCss).toContain("border-color: var(--drift-ui-signal);");
  expect(overlayCss).toContain("scrollbar-color: var(--drift-ui-overlay-scrollbar) transparent;");
  expect(overlayCss).not.toContain("transition-property: all");
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
