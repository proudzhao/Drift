import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, expect, test, vi } from "vitest";
import css from "../../styles/tailwind.css?raw";
import {
  Button,
  FormRow,
  Input,
  Panel,
  SegmentedControl,
  Select,
  Tooltip,
  TooltipProvider,
  Toggle,
} from ".";

const DARK_THEME_TOKENS: Record<string, string> = {
  "--drift-ui-workspace": "#071014",
  "--drift-ui-sidebar": "#0b1418",
  "--drift-ui-surface": "#0e171c",
  "--drift-ui-raised": "#132027",
  "--drift-ui-input": "#0a1519",
  "--drift-ui-hover": "#14272d",
  "--drift-ui-selected": "#17282f",
  "--drift-ui-border": "#29414a",
  "--drift-ui-border-strong": "#3a5964",
  "--drift-ui-line": "#20343c",
  "--drift-ui-ink": "#eaf6f7",
  "--drift-ui-ink-soft": "#c7dadd",
  "--drift-ui-muted": "#789097",
  "--drift-ui-subtle": "#60777e",
  "--drift-ui-disabled": "#506970",
  "--drift-ui-signal": "#32c7d9",
  "--drift-ui-signal-text": "#62d7e4",
  "--drift-ui-on-signal": "#071014",
  "--drift-ui-success": "#42c983",
  "--drift-ui-warning": "#e6a15a",
  "--drift-ui-danger": "#e06c75",
  "--drift-ui-success-soft": "rgba(66, 201, 131, 0.08)",
  "--drift-ui-warning-soft": "rgba(230, 161, 90, 0.08)",
  "--drift-ui-danger-soft": "rgba(224, 108, 117, 0.09)",
  "--drift-ui-success-border": "rgba(66, 201, 131, 0.4)",
  "--drift-ui-warning-border": "rgba(230, 161, 90, 0.45)",
  "--drift-ui-danger-border": "rgba(224, 108, 117, 0.45)",
  "--drift-ui-followed": "#ff9ad1",
  "--drift-ui-followed-soft": "rgba(255, 111, 190, 0.1)",
  "--drift-ui-followed-border": "rgba(255, 111, 190, 0.5)",
  "--drift-ui-glass": "rgba(7, 16, 20, 0.92)",
  "--drift-ui-drawer": "rgba(7, 16, 20, 0.95)",
  "--drift-ui-shadow": "rgba(0, 0, 0, 0.3)",
  "--drift-ui-send-background":
    "linear-gradient(145deg, rgba(7,16,20,.78), rgba(14,23,28,.74))",
  "--drift-ui-send-border": "rgba(67, 102, 112, 0.72)",
  "--drift-ui-send-shadow": "rgba(2, 10, 13, 0.34)",
  "--drift-ui-inset-highlight": "rgba(255, 255, 255, 0.05)",
  "--drift-ui-edit-backdrop": "rgba(9, 14, 20, 0.16)",
  "--drift-ui-edit-outline": "rgba(126, 168, 196, 0.82)",
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

const LIGHT_THEME_TOKENS: Record<string, string> = {
  "--drift-ui-workspace": "#edf4f6",
  "--drift-ui-sidebar": "#dfeaed",
  "--drift-ui-surface": "#f8fbfc",
  "--drift-ui-raised": "#ffffff",
  "--drift-ui-input": "#f8fbfc",
  "--drift-ui-hover": "#e8f1f3",
  "--drift-ui-selected": "#d5e9ed",
  "--drift-ui-border": "#c8d9dd",
  "--drift-ui-border-strong": "#9fb9c0",
  "--drift-ui-line": "#d6e3e6",
  "--drift-ui-ink": "#132a31",
  "--drift-ui-ink-soft": "#29434b",
  "--drift-ui-muted": "#60777e",
  "--drift-ui-subtle": "#6f858c",
  "--drift-ui-disabled": "#9aabb0",
  "--drift-ui-signal": "#0e99ad",
  "--drift-ui-signal-text": "#087f8f",
  "--drift-ui-on-signal": "#071014",
  "--drift-ui-success": "#167d50",
  "--drift-ui-warning": "#9a5d16",
  "--drift-ui-danger": "#b23f4d",
  "--drift-ui-success-soft": "rgba(22, 125, 80, 0.09)",
  "--drift-ui-warning-soft": "rgba(154, 93, 22, 0.09)",
  "--drift-ui-danger-soft": "rgba(178, 63, 77, 0.09)",
  "--drift-ui-success-border": "rgba(22, 125, 80, 0.35)",
  "--drift-ui-warning-border": "rgba(154, 93, 22, 0.38)",
  "--drift-ui-danger-border": "rgba(178, 63, 77, 0.38)",
  "--drift-ui-followed": "#b92875",
  "--drift-ui-followed-soft": "rgba(185, 40, 117, 0.09)",
  "--drift-ui-followed-border": "rgba(185, 40, 117, 0.35)",
  "--drift-ui-glass": "rgba(248, 251, 252, 0.92)",
  "--drift-ui-drawer": "rgba(255, 255, 255, 0.95)",
  "--drift-ui-shadow": "rgba(30, 67, 77, 0.14)",
  "--drift-ui-send-background":
    "linear-gradient(145deg, rgba(248,251,252,.94), rgba(255,255,255,.88))",
  "--drift-ui-send-border": "rgba(159, 185, 192, 0.78)",
  "--drift-ui-send-shadow": "rgba(30, 67, 77, 0.16)",
  "--drift-ui-inset-highlight": "rgba(255, 255, 255, 0.55)",
  "--drift-ui-edit-backdrop": "rgba(237, 244, 246, 0.18)",
  "--drift-ui-edit-outline": "rgba(14, 153, 173, 0.55)",
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

function extractRuleBody(selector: string, fromEnd = false) {
  const ruleStart = fromEnd
    ? css.lastIndexOf(`${selector} {`)
    : css.indexOf(`${selector} {`);
  expect(ruleStart, `missing CSS rule for ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = css.indexOf("{", ruleStart) + 1;
  const bodyEnd = css.indexOf("\n}", bodyStart);
  expect(bodyEnd, `unterminated CSS rule for ${selector}`).toBeGreaterThan(bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

function extractCustomProperties(ruleBody: string) {
  return Object.fromEntries(
    ruleBody
      .split("\n")
      .map((line) => line.trim().match(/^(--[\w-]+):\s*(.+);$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

function extractScopedRuleBodies(scope: string) {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((match) => match[1].includes(scope))
    .map((match) => match[2])
    .join("\n");
}

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterAll(() => {
  vi.unstubAllGlobals();
});

test("defines the root dark and Cyan Frost light semantic token contract", () => {
  const darkRuleBody = extractRuleBody('html[data-drift-theme="dark"]');
  const lightRuleBody = extractRuleBody('html[data-drift-theme="light"]');

  expect(darkRuleBody).toContain("color-scheme: dark;");
  expect(lightRuleBody).toContain("color-scheme: light;");
  expect(extractCustomProperties(darkRuleBody)).toEqual(DARK_THEME_TOKENS);
  expect(extractCustomProperties(lightRuleBody)).toEqual(LIGHT_THEME_TOKENS);
  expect(
    extractCustomProperties(
      extractRuleBody(
        ".drift-control-shell,\n.drift-send-shell,\n.drift-overlay-workspace",
      ),
    ),
  ).toEqual({
    "--color-drift-surface-dark": "var(--drift-ui-surface)",
    "--color-drift-raised": "var(--drift-ui-raised)",
    "--color-drift-line": "var(--drift-ui-line)",
    "--color-drift-ink": "var(--drift-ui-ink)",
    "--color-drift-signal": "var(--drift-ui-signal)",
  });
  expect(css).not.toMatch(
    /\.drift-(?:control-shell|send-shell|overlay-workspace)[^{]*\{[^}]*--color-drift-void/s,
  );
  expect(css).toContain("transition-duration: 150ms");
  expect(css).toContain(
    "transition-property: color, background-color, border-color, box-shadow, fill",
  );
  expect(css).toContain(".drift-settings-sidebar");
  expect(css).toContain("width 180ms ease");
  expect(css).toContain("transition-duration: 0ms !important");
  expect(css).not.toContain(".drift-control-shell * {");
  expect(css).not.toContain("transition-property: all");
});

test("lets the migrated send and overlay scopes follow the root scheme", () => {
  expect(extractRuleBody('html[data-drift-theme="light"]')).toContain(
    "color-scheme: light;",
  );
  expect(extractRuleBody(".drift-send-shell")).toContain("color-scheme: inherit;");
  expect(extractRuleBody(".drift-overlay-workspace", true)).toContain(
    "color-scheme: inherit;",
  );
});

test("derives the control focus halo from the active signal token", () => {
  expect(css).toContain(
    "color-mix(in srgb, var(--drift-ui-signal) 18%, transparent)",
  );
  expect(extractScopedRuleBodies(".drift-control-shell")).not.toMatch(
    /rgba?\(\s*50(?:\s*,\s*|\s+)199(?:\s*,\s*|\s+)217/i,
  );
});

test("keeps light theme controls and tooltip portal on semantic markers", async () => {
  const previousTheme = document.documentElement.dataset.driftTheme;
  document.documentElement.dataset.driftTheme = "light";
  const user = userEvent.setup();

  const { unmount } = render(
    <TooltipProvider delayDuration={0}>
      <div className="drift-control-shell">
        <Tooltip content="语义提示">
          <Button>打开提示</Button>
        </Tooltip>
      </div>
    </TooltipProvider>,
  );

  await user.hover(screen.getByRole("button", { name: "打开提示" }));

  expect(screen.getByRole("button", { name: "打开提示" })).toHaveClass(
    "drift-button",
  );
  expect(await screen.findByText("语义提示")).toHaveClass("drift-tooltip");

  unmount();
  if (previousTheme === undefined) {
    delete document.documentElement.dataset.driftTheme;
  } else {
    document.documentElement.dataset.driftTheme = previousTheme;
  }
});

test("exposes stable component markers for control-scoped theming", () => {
  render(
    <div>
      <Button>保存</Button>
      <Input aria-label="房间号" />
      <Select aria-label="分组"><option>全部</option></Select>
      <Toggle aria-label="显示用户名" checked onCheckedChange={vi.fn()} />
      <SegmentedControl
        ariaLabel="密度"
        onChange={vi.fn()}
        options={[{ label: "高", value: "high" }]}
        value="high"
      />
      <Panel title="状态">内容</Panel>
      <FormRow control={<span>控件</span>} label="标签" />
      <FormRow
        control={<span>另一个控件</span>}
        description="辅助说明"
        label="带说明标签"
      />
    </div>,
  );

  expect(screen.getByRole("button", { name: "保存" })).toHaveClass("drift-button");
  expect(screen.getByRole("textbox", { name: "房间号" })).toHaveClass("drift-input");
  expect(screen.getByRole("combobox", { name: "分组" })).toHaveClass("drift-select");
  expect(screen.getByRole("switch", { name: "显示用户名" })).toHaveClass("drift-toggle");
  expect(screen.getByRole("group", { name: "密度" })).toHaveClass("drift-segmented-control");
  expect(screen.getByRole("region", { name: "状态" })).toHaveClass("drift-panel");
  const formRow = screen.getByText("标签").closest(".drift-form-row");
  expect(formRow).toHaveClass("drift-form-row");
  expect(screen.getByText("辅助说明")).toHaveClass(
    "drift-form-row-description",
  );
});
