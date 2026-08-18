import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Input } from "./Input";

test("forwards the native input ref", () => {
  const inputRef = createRef<HTMLInputElement>();
  render(<Input aria-label="弹幕内容" ref={inputRef} />);

  expect(inputRef.current).toBe(
    screen.getByRole("textbox", { name: "弹幕内容" }),
  );
  inputRef.current?.focus();
  expect(inputRef.current).toHaveFocus();
});
