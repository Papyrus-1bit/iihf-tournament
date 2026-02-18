import type { FC, HTMLAttributes } from "react";
import { cx } from "./utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
}

const StatCard: FC<Props> = ({ label, value, className, ...rest }) => (
  <div className={cx("ui-stat-card", className)} {...rest}>
    <div className="ui-stat-card-value">{value}</div>
    <div className="ui-stat-card-label">{label}</div>
  </div>
);

export default StatCard;
