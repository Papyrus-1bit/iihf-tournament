import type { FC, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

export const Input: FC<InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input className={cx("ui-input", className)} {...rest} />
);

export const Select: FC<SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cx("ui-select", className)} {...rest} />;

export const Textarea: FC<TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cx("ui-textarea", className)} {...rest} />;
