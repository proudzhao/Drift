import {
  CONTROL_PAGE_SCENARIOS,
  ControlPageScenarioPreview,
  type ControlPageScenarioId,
} from "./pageScenarios";
import {
  SEND_WINDOW_SCENARIOS,
  SendWindowScenarioPreview,
  isSendWindowScenarioId,
  type SendWindowScenarioId,
} from "./sendScenarios";
import {
  OVERLAY_SCENARIOS,
  OverlayScenarioPreview,
  isOverlayScenarioId,
  type OverlayScenarioId,
} from "./overlayScenarios";

export type PreviewScenarioId =
  | ControlPageScenarioId
  | SendWindowScenarioId
  | OverlayScenarioId;

export const PREVIEW_SCENARIOS = [
  ...CONTROL_PAGE_SCENARIOS,
  ...SEND_WINDOW_SCENARIOS,
  ...OVERLAY_SCENARIOS,
];

export function getPreviewScenario(value: string | null) {
  return (
    PREVIEW_SCENARIOS.find((scenario) => scenario.id === value) ??
    PREVIEW_SCENARIOS[0]
  );
}

export function PreviewScenario({
  scenarioId,
}: {
  scenarioId: PreviewScenarioId;
}) {
  if (isOverlayScenarioId(scenarioId)) {
    return <OverlayScenarioPreview scenarioId={scenarioId} />;
  }
  if (isSendWindowScenarioId(scenarioId)) {
    return <SendWindowScenarioPreview scenarioId={scenarioId} />;
  }
  return <ControlPageScenarioPreview scenarioId={scenarioId} />;
}

export function PreviewScenarioPicker({
  onScenarioChange,
  selectedScenarioId,
}: {
  onScenarioChange: (scenarioId: PreviewScenarioId) => void;
  selectedScenarioId: PreviewScenarioId;
}) {
  return (
    <details className="group fixed bottom-10 right-3 z-[100] text-[9px] text-[#789097]">
      <summary className="ml-auto w-fit cursor-pointer list-none rounded-md border border-drift-line bg-drift-raised/95 px-2 py-1.5 font-semibold text-[#9db4ba] shadow-lg backdrop-blur marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-signal/40">
        开发场景
      </summary>
      <label className="absolute bottom-full right-0 mb-1.5 grid w-48 gap-1 rounded-lg border border-drift-line bg-drift-raised/95 p-2 shadow-xl backdrop-blur">
        开发预览场景
        <select
          aria-label="开发预览场景"
          className="drift-select min-h-7 rounded-md border border-[#29414a] bg-[#0a1519] px-2 text-[10px] text-drift-ink outline-none focus:border-drift-signal"
          onChange={(event) =>
            onScenarioChange(event.currentTarget.value as PreviewScenarioId)
          }
          value={selectedScenarioId}
        >
          {PREVIEW_SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
      </label>
    </details>
  );
}
