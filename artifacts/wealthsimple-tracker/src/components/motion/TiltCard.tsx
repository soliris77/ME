import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { PointerEvent, ReactNode } from "react";
import { TILT } from "@/lib/motion";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  intensity?: number;
  glare?: boolean;
}

export function TiltCard({
  children,
  className,
  intensity = 1,
  glare = true,
}: TiltCardProps) {
  const reduced = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(
    useTransform(py, [-0.5, 0.5], [TILT.maxRotate * intensity, -TILT.maxRotate * intensity]),
    TILT.spring,
  );
  const ry = useSpring(
    useTransform(px, [-0.5, 0.5], [-TILT.maxRotate * intensity, TILT.maxRotate * intensity]),
    TILT.spring,
  );
  const glareX = useTransform(px, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(py, [-0.5, 0.5], ["0%", "100%"]);
  const glareBg = useMotionTemplate`radial-gradient(340px circle at ${glareX} ${glareY}, hsl(43 80% 78% / 0.16), transparent 62%)`;

  if (reduced) return <div className={className}>{children}</div>;

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <motion.div
      className={className}
      onPointerMove={handleMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformPerspective: TILT.perspective,
        transformStyle: "preserve-3d",
        position: "relative",
        willChange: "transform",
      }}
      whileHover={{ scale: TILT.scale }}
      transition={{ type: "spring", ...TILT.spring }}
    >
      {children}
      {glare && (
        <motion.span
          aria-hidden
          style={{
            background: glareBg,
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
          }}
        />
      )}
    </motion.div>
  );
}