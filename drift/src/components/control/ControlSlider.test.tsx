import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ControlSlider } from "./ControlSlider";

test("keeps numeric range changes in an accessible settings row", () => {
  const onChange = vi.fn();
  render(
    <ControlSlider
      label="字号"
      max={32}
      min={14}
      onChange={onChange}
      suffix="px"
      value={20}
    />,
  );

  fireEvent.change(screen.getByRole("slider", { name: "字号" }), {
    target: { value: "24" },
  });

  expect(onChange).toHaveBeenCalledWith(24);
  expect(screen.getByText("20px")).toHaveClass("drift-data-text");
});
