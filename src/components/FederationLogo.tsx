import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";

interface Props {
  code: string;
  name: string;
  size?: number;
}

const EXTENSIONS = ["png", "svg", "webp", "jpg", "jpeg"] as const;

const LOGO_NAME_OVERRIDES: Record<string, string[]> = {
  AT: ["austria"],
  CH: ["swiss"],
  FI: ["fn"],
  GB: ["great britain"],
  RU: ["russia"],
  SI: ["slovenia"],
};

const buildSources = (code: string) => {
  const upper = code.trim().toUpperCase();
  const lower = upper.toLowerCase();
  const names = [...(LOGO_NAME_OVERRIDES[upper] ?? []), lower];

  const sources: string[] = [];
  names.forEach((name) => {
    const encodedName = encodeURIComponent(name);
    EXTENSIONS.forEach((ext) => {
      sources.push(`/federations/${encodedName}.${ext}`);
    });
  });

  return sources;
};

const FederationLogo: FC<Props> = ({ code, name, size = 28 }) => {
  const sources = useMemo(() => buildSources(code), [code]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const src = sources[sourceIndex];

  return (
    <span
      className={`federation-logo${src ? "" : " federation-logo--placeholder"}`}
      style={{ width: size, height: size }}
      aria-label={name}
      title={name}
    >
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
