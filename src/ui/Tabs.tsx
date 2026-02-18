import type { ButtonHTMLAttributes, FC, HTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./utils";

export const Tabs: FC<PropsWithChildren<HTMLAttributes<HTMLDivElement>>> = ({
  className,
  ...rest
}) => <div className={cx("ui-tabs", className)} {...rest} />;

interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Tab: FC<PropsWithChildren<TabProps>> = ({
  active,
  className,
  ...rest
}) => (
  <button
    className={cx("ui-tab", className)}
    data-active={active ? "true" : "false"}
    {...rest}
  />
);
