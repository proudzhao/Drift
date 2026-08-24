import { afterEach, expect, test, vi } from "vitest";
import {
  UI_THEME_STORAGE_KEY,
  applyDocumentUiTheme,
  applyNativeAppTheme,
  normalizeUiTheme,
  readBootstrapUiTheme,
  readStoredUiTheme,
} from "./uiTheme";

const appThemeMock = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ setTheme: appThemeMock.setTheme }));

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.driftTheme;
  document.documentElement.style.colorScheme = "";
  vi.restoreAllMocks();
  appThemeMock.setTheme.mockReset();
});

test("normalizes only light and otherwise uses dark", () => {
  expect(normalizeUiTheme("light")).toBe("light");
  expect(normalizeUiTheme("dark")).toBe("dark");
  expect(normalizeUiTheme("system")).toBe("dark");
  expect(normalizeUiTheme(null)).toBe("dark");
});

test("reads and applies the local bootstrap mirror", () => {
  localStorage.setItem(UI_THEME_STORAGE_KEY, "light");
  expect(readStoredUiTheme()).toBe("light");
  applyDocumentUiTheme("light");
  expect(document.documentElement.dataset.driftTheme).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("light");
  expect(readBootstrapUiTheme()).toBe("light");
});

test("prefers a valid document bootstrap attribute", () => {
  localStorage.setItem(UI_THEME_STORAGE_KEY, "dark");
  document.documentElement.dataset.driftTheme = "light";
  expect(readBootstrapUiTheme()).toBe("light");
});

test("keeps document apply working when storage access fails", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  expect(() => applyDocumentUiTheme("light")).not.toThrow();
  expect(document.documentElement.dataset.driftTheme).toBe("light");
});

test("treats native theme sync as best effort", async () => {
  appThemeMock.setTheme.mockRejectedValueOnce(new Error("unsupported"));
  await expect(applyNativeAppTheme("light")).resolves.toBeUndefined();
  expect(appThemeMock.setTheme).toHaveBeenCalledWith("light");
});

test("keeps the HTML bootstrap key and values aligned", async () => {
  const html = await import("../../index.html?raw");
  expect(html.default).toContain(`const storageKey = "${UI_THEME_STORAGE_KEY}"`);
  expect(html.default).toContain('stored === "light" || stored === "dark"');
  expect(html.default).toContain("document.documentElement.dataset.driftTheme");
});
