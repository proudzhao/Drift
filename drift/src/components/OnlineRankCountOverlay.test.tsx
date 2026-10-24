import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import appCss from "../App.css?raw";
import { OnlineRankCountOverlay, formatOnlineCount } from "./OnlineRankCountOverlay";

test("formats online counts with a compact ten-thousand unit", () => {
  expect(formatOnlineCount(0)).toBe("0");
  expect(formatOnlineCount(863)).toBe("863");
  expect(formatOnlineCount(12000)).toBe("1.2万");
  expect(formatOnlineCount(123456)).toBe("12.3万");
});

test("renders one compact row per room and hides when empty", () => {
  const { rerender } = render(
    <OnlineRankCountOverlay
      items={[
        { sessionId: "s1", roomId: 6, label: "补给箱", count: 12000 },
        { sessionId: "s2", roomId: 7, label: "小海梓", count: 863 },
      ]}
    />,
  );

  expect(screen.getByLabelText("直播间同接数")).toHaveClass(
    "online-rank-count-overlay",
  );
  expect(screen.getByText("补给箱").parentElement).toHaveTextContent("补给箱1.2万");
  expect(screen.getByText("小海梓").parentElement).toHaveTextContent("小海梓863");
  const overlayRule = appCss.match(/\.online-rank-count-overlay\s*\{([^}]*)\}/s)?.[1];
  expect(overlayRule).toMatch(/height:\s*22px/);
  expect(overlayRule).toMatch(/display:\s*flex/);
  expect(overlayRule).toMatch(/width:\s*max-content/);
  expect(overlayRule).toMatch(/max-width:\s*100%/);
  expect(overlayRule).toMatch(/white-space:\s*nowrap/);
  expect(overlayRule).not.toMatch(
    /right:|background:|border-bottom|border-radius|box-shadow|backdrop-filter/,
  );
  expect(appCss).toContain("pointer-events: none");
  expect(appCss).toMatch(
    /\.danmaku-stage\.has-online-rank-counts\s*\{[^}]*top:\s*22px;/s,
  );

  rerender(<OnlineRankCountOverlay items={[]} />);
  expect(screen.queryByLabelText("直播间同接数")).not.toBeInTheDocument();
});
