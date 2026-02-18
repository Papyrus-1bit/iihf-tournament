import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const FederationLogo: FC<Props> = ({ code, name, size = 28 }) => {
  const primarySrc = useMemo(() => `/federations/${code.toLowerCase()}.svg`, [code]);
  const fallbackSrc = useMemo(() => `/svg/${code.toLowerCase()}.svg`, [code]);
  const [src, setSrc] = useState(primarySrc);

  useEffect(() => {
    setSrc(primarySrc);
  }, [primarySrc]);
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={(e) => {
        if (src === fallbackSrc) return;
        setSrc(fallbackSrc);
      }}
      style={{
        objectFit: "contain",
        borderRadius: "6px",
        background: "rgba(255, 255, 255, 0.04)",
        padding: "2px",
      }}
      loading="lazy"
    />
  );
};

export default FederationLogo;
