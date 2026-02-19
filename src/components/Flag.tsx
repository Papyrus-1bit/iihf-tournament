import type { FC } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const Flag: FC<Props> = ({ code, name, size = 24 }) => {
  const src = `/svg/${code.toLowerCase()}.svg`;
  const height = size;
  const width = Math.round(size * 1.5);
  return (
    <span
      style={{
        display: "inline-flex",
        width,
        height,
        overflow: "hidden",
        borderRadius: "2px",
        verticalAlign: "middle",
        flex: "0 0 auto",
      }}
    >
      <img
        src={src}
        alt={name}
        width={width}
        height={height}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          display: "block",
        }}
        loading="lazy"
      />
    </span>
  );
};

export default Flag;
