import type { FC, PropsWithChildren } from "react";
import "./tokens.css";
import { cx } from "./utils";

interface Props {
  className?: string;
}

const UiRoot: FC<PropsWithChildren<Props>> = ({ children, className }) => (
  <div className={cx("ui-root", className)}>{children}</div>
);

export default UiRoot;
