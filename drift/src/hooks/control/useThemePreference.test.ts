import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useThemePreference } from "./useThemePreference";

const themeRuntimeMock = vi.hoisted(() => ({
  applyDocumentUiTheme: vi.fn(),
  applyNativeAppTheme: vi.fn(async () => undefined),
}));

vi.mock("../../utils/uiTheme", () => themeRuntimeMock);

afterEach(() => vi.clearAllMocks());

test("applies immediately and persists the target theme", async () => {
  const saveTheme = vi.fn(async () => undefined);
  const { result } = renderHook(() =>
    useThemePreference({ theme: "dark", saveTheme }),
  );

  await act(() => result.current.toggleTheme());

  expect(themeRuntimeMock.applyDocumentUiTheme).toHaveBeenCalledWith("light");
  expect(themeRuntimeMock.applyNativeAppTheme).toHaveBeenCalledWith("light");
  expect(saveTheme).toHaveBeenCalledWith("light");
  expect(result.current.theme).toBe("light");
  expect(result.current.themeError).toBe("");
});

test("disables concurrent toggles while save is pending", async () => {
  let resolveSave: (() => void) | undefined;
  const saveTheme = vi.fn(
    () => new Promise<void>((resolve) => { resolveSave = resolve; }),
  );
  const { result } = renderHook(() =>
    useThemePreference({ theme: "dark", saveTheme }),
  );

  let first: Promise<void> | undefined;
  act(() => { first = result.current.toggleTheme(); });
  expect(result.current.isThemeSaving).toBe(true);
  await act(() => result.current.toggleTheme());
  expect(saveTheme).toHaveBeenCalledOnce();
  await act(async () => { resolveSave?.(); await first; });
});

test("synchronously locks duplicate toggles before React rerenders", async () => {
  let resolveSave: (() => void) | undefined;
  const saveTheme = vi.fn(
    () => new Promise<void>((resolve) => { resolveSave = resolve; }),
  );
  const { result } = renderHook(() =>
    useThemePreference({ theme: "dark", saveTheme }),
  );

  act(() => {
    void result.current.toggleTheme();
    void result.current.toggleTheme();
  });

  expect(saveTheme).toHaveBeenCalledOnce();
  expect(themeRuntimeMock.applyDocumentUiTheme).toHaveBeenCalledOnce();
  expect(themeRuntimeMock.applyDocumentUiTheme).toHaveBeenCalledWith("light");
  await act(async () => { resolveSave?.(); });
});

test("rolls back document and native theme when save fails", async () => {
  const saveTheme = vi.fn(async () => { throw new Error("write failed"); });
  const { result } = renderHook(() =>
    useThemePreference({ theme: "dark", saveTheme }),
  );

  await act(() => result.current.toggleTheme());

  expect(themeRuntimeMock.applyDocumentUiTheme).toHaveBeenNthCalledWith(1, "light");
  expect(themeRuntimeMock.applyDocumentUiTheme).toHaveBeenLastCalledWith("dark");
  expect(themeRuntimeMock.applyNativeAppTheme).toHaveBeenLastCalledWith("dark");
  expect(result.current.theme).toBe("dark");
  expect(result.current.themeError).toBe("主题保存失败，已恢复原主题");
});
