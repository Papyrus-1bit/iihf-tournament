import type { FC, HTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./utils";

const SectionHeader: FC<PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>> = ({
  className,
  ...rest
}) => <p className={cx("ui-subtitle", className)} {...rest} />;

export default SectionHeader;
