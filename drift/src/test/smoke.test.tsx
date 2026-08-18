import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("renders React components in jsdom", () => {
  render(<button type="button">连接</button>);
  expect(screen.getByRole("button", { name: "连接" })).toBeVisible();
});
