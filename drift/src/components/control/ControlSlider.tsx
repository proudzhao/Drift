import type { ReactNode } from "react";
import { DataValue, SettingsRow } from "./settings-ui";

type ControlSliderProps = {
  description?: ReactNode;
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
};

export function ControlSlider({
  description,
  disabled = false,
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: ControlSliderProps) {
  const id = `control-slider-${label}`;

  return (
    <SettingsRow
      control={
        <div className="grid min-w-[180px] grid-cols-[minmax(96px,1fr)_48px] items-center gap-3 max-[519px]:min-w-0">
          <input
            aria-label={label}
            className="w-full accent-drift-signal"
            disabled={disabled}
            id={id}
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            type="range"
            value={value}
          />
          <DataValue className="text-right">
            {value}
            {suffix}
          </DataValue>
        </div>
      }
      description={description}
      htmlFor={id}
      label={label}
    />
  );
}
