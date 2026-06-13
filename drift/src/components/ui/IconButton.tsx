import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../utils/classNames";
import { Button } from "./Button";

type IconButtonSize = "sm" | "md";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: IconButtonSize;
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "size-7 px-0",
  md: "size-8 px-0",
};

export function IconButton({
  className,
  size = "md",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      className={classNames("shrink-0", SIZE_CLASSES[size], className)}
      size="sm"
      variant={variant}
      {...props}
    />
  );
}
