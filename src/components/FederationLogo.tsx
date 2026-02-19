import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const EXTENSIONS = ["svg", "png", "webp", "jpg", "jpeg"] as const;

const LOGO_ALIASES: Record<string, string[]> = {
  AT: ["au"],
  BY: ["rb"],
  CA: ["cn"],
  CH: ["sw"],
  DE: ["gr"],
  DK: ["dn"],
  FI: ["fn"],
  HU: ["hg"],
  NO: ["nw"],
  SE: ["sl", "sn"],
  SI: ["sv"],
  SK: ["sl", "sn"],
};

const buildSources = (code: string) => {
  const upper = code.toUpperCase();
  const lower = code.toLowerCase();
  const aliases = [lower, ...(LOGO_ALIASES[upper] ?? [])];
  const sources: string[] = [];
  aliases.forEach((alias) => {
    EXTENSIONS.forEach((ext) => {
      sources.push(`/federations/${alias}.${ext}`);
    });
  });
  sources.push(`/svg/${lower}.svg`);
  return Array.from(new Set(sources));
};

const FederationLogo: FC<Props> = ({ code, name, size = 28 }) => {
  const sources = useMemo(() => buildSources(code), [code]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const src = sources[sourceIndex];

  return (
    <span className="federation-logo" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          onError={() => setSourceIndex((prev) => prev + 1)}
          className="federation-logo__img"
          loading="lazy"
        />
      ) : (
        <span className="federation-logo__placeholder">{code.toUpperCase()}</span>
      )}
    </span>
  );
};

export default FederationLogo;
