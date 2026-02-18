import type { ButtonHTMLAttributes, FC, PropsWithChildren } from "react";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "ghost" | "default";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const Button: FC<PropsWithChildren<Props>> = ({
  variant = "default",
  className,
  ...rest
}) => (
  <button
    className={cx("ui-button", className)}
    data-variant={variant}
    {...rest}
  />
);

export default Button;
