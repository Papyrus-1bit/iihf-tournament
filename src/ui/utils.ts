export const cx = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");
