import type { FC, PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import "./tokens.css";
import { cx } from "./utils";

interface Props {
  className?: string;
}

const UiRoot: FC<PropsWithChildren<Props>> = ({ children, className }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const blobs = [
      { x: 12, y: 6, vx: 0.035, vy: 0.025 },
      { x: 88, y: 14, vx: -0.03, vy: 0.02 },
      { x: 46, y: 72, vx: 0.025, vy: -0.03 },
    ];
    let rafId = 0;
    let last = performance.now();

    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value));

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16, 2);
      last = now;
      blobs.forEach((blob) => {
        if (Math.random() < 0.02) {
          blob.vx += (Math.random() - 0.5) * 0.08;
          blob.vy += (Math.random() - 0.5) * 0.08;
        }
        blob.vx = clamp(blob.vx, -0.2, 0.2);
        blob.vy = clamp(blob.vy, -0.2, 0.2);
        blob.x += blob.vx * dt * 3.5;
        blob.y += blob.vy * dt * 3.5;
        if (blob.x < 6 || blob.x > 94) blob.vx *= -1;
        if (blob.y < 6 || blob.y > 94) blob.vy *= -1;
        blob.x = clamp(blob.x, 6, 94);
        blob.y = clamp(blob.y, 6, 94);
      });

      root.style.setProperty("--blob1-x", `${blobs[0].x}%`);
      root.style.setProperty("--blob1-y", `${blobs[0].y}%`);
      root.style.setProperty("--blob2-x", `${blobs[1].x}%`);
      root.style.setProperty("--blob2-y", `${blobs[1].y}%`);
      root.style.setProperty("--blob3-x", `${blobs[2].x}%`);
      root.style.setProperty("--blob3-y", `${blobs[2].y}%`);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={rootRef} className={cx("ui-root", className)}>
      {children}
    </div>
  );
};

export default UiRoot;
