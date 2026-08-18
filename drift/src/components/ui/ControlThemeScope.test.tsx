import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  Button,
  FormRow,
  Input,
  Panel,
  SegmentedControl,
  Select,
  Toggle,
} from ".";

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
