import type { FC, HTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./utils";

const Tag: FC<PropsWithChildren<HTMLAttributes<HTMLSpanElement>>> = ({
  className,
  ...rest
}) => <span className={cx("ui-tag", className)} {...rest} />;

export default Tag;
