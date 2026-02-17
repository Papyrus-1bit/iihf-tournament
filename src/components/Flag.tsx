import type { FC } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const Flag: FC<Props> = ({ code, name, size = 24 }) => {
  const src = `/svg/${code.toLowerCase()}.svg`;
  const height = Math.round(size * 0.7);
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={height}
      style={{ objectFit: "cover", borderRadius: "2px", verticalAlign: "middle" }}
      loading="lazy"
    />
  );
};

export default Flag;
