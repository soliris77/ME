import { useState, useEffect, useRef } from "react";

/**
 * Anime un nombre de 0 vers `target` avec une ease-out cubique.
 * Réinitialise l'animation à chaque changement de `target`.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic: décélère vers la fin
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
