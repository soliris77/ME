import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DONNEES_TERRE } from "./MarketGlobeTerre";
import { creerGlobe, type EtatGlobe, type Globe } from "./MarketGlobeMoteur";

/**
 * Le globe de l'observatoire.
 *
 * Le composant ne fait que trois choses : tenir la toile, demarrer le moteur
 * une seule fois, et l'arreter au demontage. Tout le rendu vit dans
 * `moteurGlobe`, qui ne connait pas React — c'est ce qui permet de le tester
 * sans monter quoi que ce soit.
 *
 * `onEtat` est appele a chaque image. Si tu t'en sers pour alimenter un state
 * React, echantillonne (une fois par seconde suffit) : soixante rendus par
 * seconde pour afficher une horloge, c'est du gaspillage.
 */

export interface CommandesGlobe {
  viserPlace(id: string): void;
  basculerRotation(): boolean;
}

interface Props {
  /** Appele a chaque image avec l'etat courant. */
  readonly onEtat?: ((etat: EtatGlobe) => void) | undefined;
  /** Degres par image de 16 ms. 0 fige le globe. Defaut : 0,045. */
  readonly vitesse?: number | undefined;
  readonly className?: string | undefined;
  readonly commandes?: Ref<CommandesGlobe> | undefined;
}

export function GlobeObservatoire({
  onEtat,
  vitesse,
  className,
  commandes,
}: Props): JSX.Element {
  const toileRef = useRef<HTMLCanvasElement | null>(null);
  const globeRef = useRef<Globe | null>(null);
  const [indisponible, setIndisponible] = useState(false);

  /* Le callback passe par une ref : sinon, une fonction recreee a chaque
     rendu du parent relancerait le moteur en boucle. */
  const surEtatRef = useRef<Props["onEtat"]>(onEtat);
  surEtatRef.current = onEtat;

  useEffect(() => {
    const toile = toileRef.current;
    if (toile === null) return;

    const globe = creerGlobe(toile, DONNEES_TERRE, {
      vitesse,
      surEtat: (e) => {
        const f = surEtatRef.current;
        if (f !== undefined) f(e);
      },
    });

    if (globe === null) {
      // Contexte 2D refuse : navigateur tres ancien, ou canvas desactive.
      setIndisponible(true);
      return;
    }

    globeRef.current = globe;
    return () => {
      globe.detruire();
      globeRef.current = null;
    };
  }, [vitesse]);

  useImperativeHandle(
    commandes,
    (): CommandesGlobe => ({
      viserPlace: (id) => globeRef.current?.viserPlace(id),
      basculerRotation: () => globeRef.current?.basculerRotation() ?? false,
    }),
    [],
  );

  if (indisponible) {
    return (
      <div className={className} role="status">
        <p>Le globe ne peut pas s&rsquo;afficher sur ce navigateur.</p>
      </div>
    );
  }

  return (
    <canvas
      ref={toileRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      aria-label="Globe terrestre : places boursieres ouvertes et couloirs de flux"
    />
  );
}

export default GlobeObservatoire;
