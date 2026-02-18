import type { FC } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const Flag: FC<Props> = ({ code, name, size = 24 }) => {
  const src = `/svg/${code.toLowerCase()}.svg`;
  const height = size;
  return (
    <img
      src={src}
      alt={name}
      height={height}
      style={{
        width: "auto",
        height,
        objectFit: "contain",
        borderRadius: "2px",
        verticalAlign: "middle",
      }}
      loading="lazy"
    />
  );
};

export default Flag;
