/**
 * WaveformVisual — onde animée stylisée (pas audio-réactive).
 *
 * Restriction technique Spotify : le Web Playback SDK ne donne aucun accès
 * aux données audio brutes (DRM). Cette animation est une boucle CSS/Canvas
 * d'ambiance : les barres oscillent avec un déphasage différent par barre
 * pour donner une impression organique, sans jamais représenter les vraies
 * fréquences de la chanson.
 *
 * Comportement :
 *   active=true  → barres animées (amplitude pleine, couleur or Soliris)
 *   active=false → barres plates (2 px, opacité réduite), animation arrêtée
 */
import { useEffect, useRef } from "react";

interface WaveformVisualProps {
  active: boolean;
  /** Largeur du canvas en pixels CSS (défaut 160). */
  width?: number;
  /** Hauteur du canvas en pixels CSS (défaut 28). */
  height?: number;
  className?: string;
}

export function WaveformVisual({
  active,
  width = 160,
  height = 28,
  className,
}: WaveformVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Résolution physique = 2× la taille CSS pour les écrans HiDPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const BAR_COUNT = 20;
    let animationId: number;

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      const barWidth = width / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const t   = frameRef.current / 18 + i * 0.45;
        const amp = active
          ? (Math.sin(t) * 0.5 + 0.5) * (height * 0.82) + 3
          : 2;

        // Or Soliris quand actif, gris discret en pause
        ctx!.fillStyle = active
          ? `rgba(201, 160, 64, ${0.55 + (amp / height) * 0.45})`
          : "rgba(201, 160, 64, 0.18)";

        ctx!.beginPath();
        ctx!.roundRect(
          i * barWidth + 1,
          height - amp,
          barWidth - 2,
          amp,
          1,
        );
        ctx!.fill();
      }

      frameRef.current += 1;
      animationId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [active, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
      className={className}
    />
  );
}
