import type { FC, HTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
}

const Panel: FC<PropsWithChildren<Props>> = ({ strong, className, ...rest }) => (
  <div
    className={cx("ui-panel", strong && "ui-panel-strong", className)}
    {...rest}
  />
);

export default Panel;
