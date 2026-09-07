import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

interface ParallaxProps {
  children: ReactNode;
  speed?: number;
  className?: string;
}

export function Parallax({ children, speed = 0.2, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const amplitude = 140 * speed;
  const y = useTransform(scrollYProgress, [0, 1], [amplitude, -amplitude]);

  return (
    <div ref={ref} className={className}>
      {reduced ? children : <motion.div style={{ y, willChange: "transform" }}>{children}</motion.div>}
    </div>
  );
}