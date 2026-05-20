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
    <label className="control-slider">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        type="range"
        value={value}
      />
      <strong>
        {value}
        {suffix}
      </strong>
    </label>
  );
}
