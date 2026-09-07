import { motion, useReducedMotion } from "framer-motion";
import type { ComponentPropsWithoutRef } from "react";
import { drawAreaVariants, drawVariants, REVEAL_VIEWPORT } from "@/lib/motion";

type PathProps = ComponentPropsWithoutRef<"path"> & { delay?: number };

export function DrawPath({ delay = 0, ...props }: PathProps) {
  const reduced = useReducedMotion();
  if (reduced) return <path {...props} />;

  return (
    <motion.path
      {...(props as ComponentPropsWithoutRef<typeof motion.path>)}
      variants={drawVariants}
      initial="initial"
      whileInView="enter"
      viewport={REVEAL_VIEWPORT}
      transition={{ delay }}
    />
  );
}

export function DrawArea({ delay = 0, ...props }: PathProps) {
  const reduced = useReducedMotion();
  if (reduced) return <path {...props} />;

  return (
    <motion.path
      {...(props as ComponentPropsWithoutRef<typeof motion.path>)}
      variants={drawAreaVariants}
      initial="initial"
      whileInView="enter"
      viewport={REVEAL_VIEWPORT}
      transition={{ delay }}
    />
  );
}