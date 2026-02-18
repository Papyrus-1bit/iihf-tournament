import type { ButtonHTMLAttributes, FC, PropsWithChildren } from "react";
import { cx } from "./utils";

const IconButton: FC<PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>> = ({
  className,
  type = "button",
  ...rest
}) => (
  <button type={type} className={cx("ui-icon-button", className)} {...rest} />
);

export default IconButton;
