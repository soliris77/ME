import { motion, useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import {
  DUR,
  REVEAL_VIEWPORT,
  revealVariants,
  type RevealDirection,
} from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  direction?: RevealDirection;
  distance?: number;
  delay?: number;
  duration?: number;
  className?: string;
  as?: ElementType;
}

export function Reveal({
  children,
  direction = "up",
  distance = 1,
  delay = 0,
  duration = DUR.slow,
  className,
  as = "div",
}: RevealProps) {
  const reduced = useReducedMotion();
  const Comp = motion[as as "div"] ?? motion.div;

  if (reduced) {
    const Static = as as ElementType;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Comp
      className={className}
      variants={revealVariants(direction, distance, duration)}
      initial="initial"
      whileInView="enter"
      viewport={REVEAL_VIEWPORT}
      transition={{ delay }}
    >
      {children}
    </Comp>
  );
}