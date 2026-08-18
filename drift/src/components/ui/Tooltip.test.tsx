import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, expect, test, vi } from "vitest";
import { Tooltip, TooltipProvider } from "./Tooltip";

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterAll(() => {
  vi.unstubAllGlobals();
});

test("shows accessible tooltip content for an icon control", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <Tooltip content="直播间">
        <button aria-label="直播间" type="button">R</button>
      </Tooltip>
    </TooltipProvider>,
  );

  await user.hover(screen.getByRole("button", { name: "直播间" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("直播间");
});
