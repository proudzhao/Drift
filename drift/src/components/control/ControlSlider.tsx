type ControlSliderProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
};

export function ControlSlider({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: ControlSliderProps) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2.5">
      <span className="text-[13px] font-semibold text-[#1f1f1f]">{label}</span>
      <input
        className="w-full accent-[#0a84ff]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        type="range"
        value={value}
      />
      <strong className="text-right text-[11px] font-medium text-[#606873]">
        {value}
        {suffix}
      </strong>
    </label>
  );
}
