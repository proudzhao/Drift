import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApiTestStep } from "../../components/control/DiagnosticsSettings";

export function useDiagnosticsPanel(draftRoomId: string) {
  const [apiTestSteps, setApiTestSteps] = useState<ApiTestStep[]>([]);
  const [apiTestError, setApiTestError] = useState("");
  const [isApiTesting, setIsApiTesting] = useState(false);
  const [expandedApiStepKey, setExpandedApiStepKey] = useState<string | null>(
    null,
  );

  async function testApi() {
    const numericRoomId = Number(draftRoomId.trim());
    if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      setApiTestError("请输入有效的直播间房间号");
      setApiTestSteps([]);
      return;
    }

    setApiTestError("");
    setApiTestSteps([]);
    setExpandedApiStepKey(null);
    setIsApiTesting(true);
    try {
      const steps = await invoke<ApiTestStep[]>("test_bilibili_api", {
        roomId: numericRoomId,
      });
      setApiTestSteps(steps);
    } catch (error) {
      setApiTestError(String(error));
    } finally {
      setIsApiTesting(false);
    }
  }

  return {
    apiTestError,
    apiTestSteps,
    expandedApiStepKey,
    isApiTesting,
    setExpandedApiStepKey,
    testApi,
  };
}
