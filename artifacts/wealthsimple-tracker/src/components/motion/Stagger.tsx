import { motion, useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import {
  REVEAL_VIEWPORT,
  STAGGER,
  revealVariants,
  staggerGroup,
  type RevealDirection,
} from "@/lib/motion";

interface StaggerGroupProps {
  children: ReactNode;
  speed?: keyof typeof STAGGER;
  delayChildren?: number;
  className?: string;
  as?: ElementType;
  onScroll?: boolean;
}

export function StaggerGroup({
  children,
  speed = "base",
  delayChildren = 0.06,
  className,
  as = "div",
  onScroll = true,
}: StaggerGroupProps) {
  const reduced = useReducedMotion();
  const Comp = motion[as as "div"] ?? motion.div;

  if (reduced) {
    const Static = as as ElementType;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Comp
      className={className}
      variants={staggerGroup(speed, delayChildren)}
      initial="initial"
      {...(onScroll
        ? { whileInView: "enter", viewport: REVEAL_VIEWPORT }
        : { animate: "enter" })}
    >
      {children}
    </Comp>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  direction?: RevealDirection;
  distance?: number;
  className?: string;
  as?: ElementType;
}

export function StaggerItem({
  children,
  direction = "up",
  distance = 0.6,
  className,
  as = "div",
}: StaggerItemProps) {
  const reduced = useReducedMotion();
  const Comp = motion[as as "div"] ?? motion.div;

  if (reduced) {
    const Static = as as ElementType;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Comp className={className} variants={revealVariants(direction, distance)}>
      {children}
    </Comp>
  );
}