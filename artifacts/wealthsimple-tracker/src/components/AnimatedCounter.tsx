/**
 * AnimatedCounter — chiffres vivants.
 * Valeur numérique : comptage fluide avec ressort.
 * Valeur texte : roulement vertical selon le sens de variation.
 */

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { rollVariants } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: string | number;
  className?: string;
  flashOnChange?: boolean;
  flashColor?: "gain" | "loss" | "neutral";
  decimals?: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
}

function flashBackground(color: AnimatedCounterProps["flashColor"]) {
  if (color === "gain") return "rgba(22,163,74,0.15)";
  if (color === "loss") return "rgba(220,38,38,0.15)";
  return "rgba(212,167,44,0.12)";
}

export function AnimatedCounter({
  value,
  className = "",
  flashOnChange = false,
  flashColor = "neutral",
  decimals,
  prefix = "",
  suffix = "",
  locale = "fr-CA",
}: AnimatedCounterProps) {
  const reduced = useReducedMotion();
  const [flash, setFlash] = useState(false);
  const previous = useRef<number>(typeof value === "number" ? value : 0);
  const numeric = typeof value === "number" && Number.isFinite(value);
  const direction = numeric ? Math.sign(value - previous.current) : 0;

  const raw = useMotionValue(numeric ? previous.current : 0);
  const spring = useSpring(raw, { stiffness: 90, damping: 20, mass: 0.7 });
  const places =
    decimals ??
    (numeric ? Math.min(String(value).split(".")[1]?.length ?? 0, 4) : 0);
  const display = useTransform(spring, (number) =>
    number.toLocaleString(locale, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }),
  );

  useEffect(() => {
    if (numeric) raw.set(value as number);
  }, [value, numeric, raw]);

  useEffect(() => {
    if (numeric) previous.current = value as number;
  });

  useEffect(() => {
    if (!flashOnChange || reduced) return;
    setFlash(true);
    const timeout = setTimeout(() => setFlash(false), 420);
    return () => clearTimeout(timeout);
  }, [value, flashOnChange, reduced]);

  const flashStyle = {
    backgroundColor: flash ? flashBackground(flashColor) : "transparent",
    borderRadius: "4px",
    padding: flash ? "2px 4px" : "0",
    transition: "background-color 0.42s ease-out, padding 0.3s ease-out",
  } as const;

  if (reduced) {
    return (
      <span className={`inline-block tabular-nums ${className}`}>
        {prefix}
        {value}
        {suffix}
      </span>
    );
  }

  if (numeric) {
    return (
      <motion.span
        className={`inline-block tabular-nums ${className}`}
        style={flashStyle}
      >
        {prefix}
        <motion.span>{display}</motion.span>
        {suffix}
      </motion.span>
    );
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.span
        key={String(value)}
        custom={direction}
        variants={rollVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className={`inline-block tabular-nums ${className}`}
        style={flashStyle}
      >
        {prefix}
        {value}
        {suffix}
      </motion.span>
    </AnimatePresence>
  );
}