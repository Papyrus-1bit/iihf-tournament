import type { FC, HTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./utils";

const Card: FC<PropsWithChildren<HTMLAttributes<HTMLDivElement>>> = ({
  className,
  ...rest
}) => <div className={cx("ui-card", className)} {...rest} />;

export default Card;
