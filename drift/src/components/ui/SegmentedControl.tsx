import { classNames } from "../../utils/classNames";
import { Button } from "./Button";

export type SegmentedControlOption<T extends string> = {
  disabled?: boolean;
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: Array<SegmentedControlOption<T>>;
  value: T;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={classNames("inline-grid grid-flow-col gap-1", className)}
      role="group"
    >
      {options.map((option) => (
        <Button
          active={value === option.value}
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={value === option.value ? "primary" : "secondary"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
