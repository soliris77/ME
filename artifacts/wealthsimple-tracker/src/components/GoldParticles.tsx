import { useMemo } from "react";

const PARTICLE_COUNT = 22;

interface Particle {
  id: number;
  left: string;
  size: string;
  duration: string;
  delay: string;
  drift: string;
}

export default function GoldParticles() {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      left: `${(i * 4.3 + Math.sin(i * 1.7) * 3) % 98}%`,
      size: `${1.5 + (i % 5) * 0.8}px`,
      duration: `${12 + (i % 7) * 3.5}s`,
      delay: `${(i * 1.1) % 14}s`,
      drift: `${(i % 2 === 0 ? 1 : -1) * (8 + (i % 5) * 6)}px`,
    }));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="gold-particle"
          style={{
            left: p.left,
            "--size": p.size,
            "--duration": p.duration,
            "--delay": p.delay,
            "--drift": p.drift,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
