import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { UI_THEME_STORAGE_KEY } from "../utils/uiTheme";
import { ThemeScenarioScope } from "./ThemeScenarioScope";

afterEach(() => {
  delete document.documentElement.dataset.driftTheme;
  document.documentElement.style.removeProperty("color-scheme");
  localStorage.removeItem(UI_THEME_STORAGE_KEY);
});

test("applies and restores the exact prior document theme state", () => {
  const root = document.documentElement;
  root.dataset.driftTheme = "dark";
  root.style.colorScheme = "normal";
  localStorage.setItem(UI_THEME_STORAGE_KEY, "stored-before-preview");

  const { unmount } = render(
    <ThemeScenarioScope theme="light">
      <span>场景</span>
    </ThemeScenarioScope>,
  );

  expect(screen.getByText("场景")).toBeVisible();
  expect(root.dataset.driftTheme).toBe("light");
  expect(root.style.colorScheme).toBe("light");
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("light");

  unmount();

  expect(root.dataset.driftTheme).toBe("dark");
  expect(root.style.colorScheme).toBe("normal");
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe(
    "stored-before-preview",
  );
});

test("restores absent document and storage state after unmount", () => {
  const root = document.documentElement;

  const { unmount } = render(
    <ThemeScenarioScope theme="dark">
      <span>无初始主题</span>
    </ThemeScenarioScope>,
  );

  expect(root.dataset.driftTheme).toBe("dark");
  expect(root.style.colorScheme).toBe("dark");
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("dark");

  unmount();

  expect(root).not.toHaveAttribute("data-drift-theme");
  expect(root.style.colorScheme).toBe("");
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBeNull();
});
