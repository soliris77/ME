/**
 * Observatoire Soliris — moteur de globe.
 *
 * Canvas 2D, projection orthographique calculee a la main, aucune dependance.
 * Le moteur ne sait rien de React : il prend une toile, il rend un objet avec
 * quelques commandes et un `detruire`. C'est ce qui le rend testable et ce qui
 * empeche la boucle de survivre au demontage du composant.
 */

const DEG = Math.PI / 180;

export interface Place {
  readonly id: string;
  readonly nom: string;
  readonly lat: number;
  readonly lon: number;
  /** Heure d'ouverture, en heures UTC decimales. */
  readonly ouvre: number;
  /** Heure de fermeture, en heures UTC decimales. */
  readonly ferme: number;
}

/**
 * Les bornes sont des heures UTC fixes : elles derivent d'environ une heure
 * aux changements d'heure locale et ignorent les jours feries. On l'assume
 * et on l'ecrit a l'ecran plutot que de pretendre a une precision qu'on n'a
 * pas.
 */
export const PLACES: readonly Place[] = [
  { id: "NYC", nom: "New York",     lat:  40.71, lon:  -74.01, ouvre: 14.5,  ferme: 21.0 },
  { id: "TOR", nom: "Toronto",      lat:  43.65, lon:  -79.38, ouvre: 14.5,  ferme: 21.0 },
  { id: "SAO", nom: "Sao Paulo",    lat: -23.55, lon:  -46.63, ouvre: 13.0,  ferme: 20.9 },
  { id: "LON", nom: "Londres",      lat:  51.51, lon:   -0.13, ouvre:  8.0,  ferme: 16.5 },
  { id: "PAR", nom: "Paris",        lat:  48.86, lon:    2.35, ouvre:  7.0,  ferme: 15.5 },
  { id: "FRA", nom: "Francfort",    lat:  50.11, lon:    8.68, ouvre:  7.0,  ferme: 15.5 },
  { id: "ZUR", nom: "Zurich",       lat:  47.37, lon:    8.54, ouvre:  7.0,  ferme: 15.5 },
  { id: "JNB", nom: "Johannesburg", lat: -26.20, lon:   28.05, ouvre:  7.0,  ferme: 15.0 },
  { id: "DXB", nom: "Dubai",        lat:  25.20, lon:   55.27, ouvre:  6.0,  ferme: 10.0 },
  { id: "MUM", nom: "Mumbai",       lat:  19.08, lon:   72.88, ouvre:  3.75, ferme: 10.0 },
  { id: "SHA", nom: "Shanghai",     lat:  31.23, lon:  121.47, ouvre:  1.5,  ferme:  7.0 },
  { id: "HKG", nom: "Hong Kong",    lat:  22.32, lon:  114.17, ouvre:  1.5,  ferme:  8.0 },
  { id: "SIN", nom: "Singapour",    lat:   1.35, lon:  103.82, ouvre:  1.0,  ferme:  9.0 },
  { id: "TOK", nom: "Tokyo",        lat:  35.68, lon:  139.69, ouvre:  0.0,  ferme:  6.0 },
  { id: "SEO", nom: "Seoul",        lat:  37.57, lon:  126.98, ouvre:  0.0,  ferme:  6.5 },
  { id: "SYD", nom: "Sydney",       lat: -33.87, lon:  151.21, ouvre:  0.0,  ferme:  6.0 },
];

/** Les axes sur lesquels les carnets se repondent reellement dans la journee. */
const COULOIRS: readonly (readonly [string, string])[] = [
  ["NYC", "LON"], ["NYC", "TOR"], ["NYC", "SAO"], ["LON", "PAR"], ["LON", "FRA"],
  ["FRA", "ZUR"], ["LON", "DXB"], ["DXB", "MUM"], ["MUM", "SIN"], ["SIN", "HKG"],
  ["HKG", "SHA"], ["TOK", "SEO"], ["TOK", "SYD"], ["LON", "TOK"], ["SIN", "SYD"],
  ["JNB", "LON"],
];

type Vecteur = readonly [number, number, number];

export interface EtatGlobe {
  readonly ouvertes: number;
  readonly total: number;
  readonly weekend: boolean;
  readonly utc: Date;
  /** Longitude ou le soleil est au zenith, maintenant. */
  readonly soleilLon: number;
  readonly centre: { readonly lat: number; readonly lon: number };
  /** La place sous le curseur, ou `null`. */
  readonly survol: Place | null;
}

export interface OptionsGlobe {
  readonly surEtat?: ((etat: EtatGlobe) => void) | undefined;
  /** Degres de rotation par image de 16 ms. 0 fige le globe. */
  readonly vitesse?: number | undefined;
}

export interface Globe {
  readonly places: readonly Place[];
  viserPlace(id: string): void;
  /** Bascule la rotation automatique. Rend `true` si elle tourne desormais. */
  basculerRotation(): boolean;
  detruire(): void;
}

function versVecteur(lon: number, lat: number): Vecteur {
  const la = lat * DEG;
  const lo = lon * DEG;
  const c = Math.cos(la);
  return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
}

/** Point subsolaire. Declinaison approchee : suffisant pour un terminateur. */
function soleil(date: Date): Vecteur {
  const debut = Date.UTC(date.getUTCFullYear(), 0, 0);
  const jour = (date.getTime() - debut) / 86_400_000;
  const decl = 23.44 * Math.sin((360 / 365.24) * (jour - 80.5) * DEG);
  return versVecteur(soleilLongitude(date), decl);
}

export function soleilLongitude(date: Date): number {
  return -15 * (heureUtc(date) - 12);
}

function heureUtc(date: Date): number {
  return (
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  );
}

export function placeOuverte(place: Place, date: Date): boolean {
  const jour = date.getUTCDay();
  if (jour === 0 || jour === 6) return false; // week-end : tout dort
  const h = heureUtc(date);
  return h >= place.ouvre && h < place.ferme;
}

export function creerGlobe(
  toile: HTMLCanvasElement,
  donneesTerre: string,
  options: OptionsGlobe = {},
): Globe | null {
  const ctx = toile.getContext("2d");
  if (ctx === null) return null;
  /* Fige le contexte dans une constante non nullable : le retrecissement
     de type ci-dessus ne suit pas jusqu'aux fonctions declarees plus bas. */
  const dessin: CanvasRenderingContext2D = ctx;

  const sobre =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Decodage du semis : deux entiers 16 bits par point. */
  const brut = atob(donneesTerre);
  const nbPoints = Math.floor(brut.length / 4);
  const terre = new Float32Array(nbPoints * 3);
  for (let i = 0; i < nbPoints; i += 1) {
    const o = i * 4;
    const lon = ((brut.charCodeAt(o) | (brut.charCodeAt(o + 1) << 8)) / 100) - 180;
    const lat = ((brut.charCodeAt(o + 2) | (brut.charCodeAt(o + 3) << 8)) / 100) - 90;
    const v = versVecteur(lon, lat);
    terre[i * 3] = v[0];
    terre[i * 3 + 1] = v[1];
    terre[i * 3 + 2] = v[2];
  }

  const vitesseParDefaut = options.vitesse ?? 0.045;
  let lacet = -20;
  let tangage = 16;
  let vitesse = sobre ? 0 : vitesseParDefaut;
  let saisi = false;
  let dernier: { x: number; y: number } | null = null;
  let curseur: { x: number; y: number } | null = null;
  let temps = 0;

  let R = 1;
  let cx = 0;
  let cy = 0;
  let dpr = 1;

  const parId = new Map<string, Place>();
  for (const p of PLACES) parId.set(p.id, p);

  function redimensionner(): void {
    const r = toile.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    toile.width = Math.max(1, Math.round(r.width * dpr));
    toile.height = Math.max(1, Math.round(r.height * dpr));
    cx = toile.width / 2;
    cy = toile.height / 2;
    R = Math.min(cx, cy) * 0.78;
  }

  /**
   * Projection orthographique centree sur (lacet, tangage). Apres le lacet,
   * `a` pointe vers l'oeil, `b` vers la droite de l'ecran, `c` vers le haut ;
   * le tangage fait ensuite tourner le couple (a, c).
   */
  function projeter(v: Vecteur): { x: number; y: number; k: number } {
    const l0 = lacet * DEG;
    const p0 = tangage * DEG;
    const cl = Math.cos(l0);
    const sl = Math.sin(l0);
    const a = v[0] * cl + v[1] * sl;
    const b = -v[0] * sl + v[1] * cl;
    const c = v[2];
    const cp = Math.cos(p0);
    const sp = Math.sin(p0);
    return { x: cx + R * b, y: cy - R * (-a * sp + c * cp), k: a * cp + c * sp };
  }

  function projeterLL(lon: number, lat: number): { x: number; y: number; k: number } {
    return projeter(versVecteur(lon, lat));
  }

  function halo(c2: CanvasRenderingContext2D): void {
    const g = c2.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
    g.addColorStop(0, "rgba(214,169,80,0)");
    g.addColorStop(0.35, "rgba(214,169,80,0.13)");
    g.addColorStop(0.7, "rgba(120,150,170,0.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c2.fillStyle = g;
    c2.beginPath();
    c2.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
    c2.fill();
  }

  function corps(c2: CanvasRenderingContext2D): void {
    const g = c2.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    g.addColorStop(0, "#101821");
    g.addColorStop(0.65, "#0A0E14");
    g.addColorStop(1, "#05070A");
    c2.fillStyle = g;
    c2.beginPath();
    c2.arc(cx, cy, R, 0, Math.PI * 2);
    c2.fill();
  }

  function tracerCercle(
    c2: CanvasRenderingContext2D,
    f: (t: number) => { x: number; y: number; k: number },
    alpha: number,
  ): void {
    c2.strokeStyle = `rgba(150,184,205,${alpha})`;
    c2.beginPath();
    let trace = false;
    for (let i = 0; i <= 128; i += 1) {
      const p = f(i / 128);
      if (p.k <= 0.002) {
        trace = false;
        continue;
      }
      if (trace) c2.lineTo(p.x, p.y);
      else {
        c2.moveTo(p.x, p.y);
        trace = true;
      }
    }
    c2.stroke();
  }

  function grille(c2: CanvasRenderingContext2D): void {
    c2.lineWidth = Math.max(0.5, dpr * 0.5);
    for (let lat = -75; lat <= 75; lat += 15) {
      const y = lat;
      tracerCercle(c2, (t) => projeterLL(-180 + t * 360, y), y === 0 ? 0.26 : 0.11);
    }
    for (let lon = -180; lon < 180; lon += 15) {
      const x = lon;
      tracerCercle(c2, (t) => projeterLL(x, -90 + t * 180), x === 0 || x === -180 ? 0.22 : 0.09);
    }
  }

  function continents(c2: CanvasRenderingContext2D, s: Vecteur): void {
    const rayon = Math.max(0.65, R * 0.0052) * dpr * 0.85;
    for (let i = 0; i < nbPoints; i += 1) {
      const vx = terre[i * 3] ?? 0;
      const vy = terre[i * 3 + 1] ?? 0;
      const vz = terre[i * 3 + 2] ?? 0;
      const p = projeter([vx, vy, vz]);
      if (p.k <= 0.03) continue;
      const jour = vx * s[0] + vy * s[1] + vz * s[2];
      const bord = Math.min(1, p.k * 2.1);
      if (jour > 0.04) {
        const a = (0.3 + 0.6 * Math.min(1, jour * 1.7)) * bord;
        c2.fillStyle = `rgba(226,193,132,${a.toFixed(3)})`;
        c2.beginPath();
        c2.arc(p.x, p.y, rayon, 0, Math.PI * 2);
        c2.fill();
      } else {
        const a = (0.09 + 0.1 * (1 + jour)) * bord;
        c2.fillStyle = `rgba(96,132,160,${a.toFixed(3)})`;
        c2.beginPath();
        c2.arc(p.x, p.y, rayon * 0.82, 0, Math.PI * 2);
        c2.fill();
      }
    }
  }

  /** La frontiere jour / nuit, assombrie en douceur depuis l'antisolaire. */
  function nuit(c2: CanvasRenderingContext2D, s: Vecteur): void {
    const p = projeter([-s[0], -s[1], -s[2]]);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const g = c2.createLinearGradient(
      cx - ux * R * 1.1, cy - uy * R * 1.1,
      cx + ux * R * 1.1, cy + uy * R * 1.1,
    );
    g.addColorStop(0, "rgba(4,6,10,0)");
    g.addColorStop(0.42, "rgba(4,6,10,0)");
    g.addColorStop(0.62, "rgba(4,6,10,0.34)");
    g.addColorStop(1, "rgba(3,5,8,0.62)");
    c2.save();
    c2.beginPath();
    c2.arc(cx, cy, R, 0, Math.PI * 2);
    c2.clip();
    c2.fillStyle = g;
    c2.fillRect(0, 0, toile.width, toile.height);
    c2.restore();
  }

  /**
   * Arc de flux : interpolation spherique entre deux places, avec une
   * elevation qui fait sortir l'arc de la sphere — sinon il passe derriere
   * et ne se lit plus.
   */
  function arc(c2: CanvasRenderingContext2D, a: Place, b: Place, phase: number, actif: boolean): void {
    const va = versVecteur(a.lon, a.lat);
    const vb = versVecteur(b.lon, b.lat);
    const pp = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
    const ang = Math.acos(Math.max(-1, Math.min(1, pp)));
    if (ang < 1e-4) return;
    const haut = 0.06 + 0.16 * (ang / Math.PI);
    const SEG = 48;
    const pts: { x: number; y: number; k: number }[] = [];
    for (let i = 0; i <= SEG; i += 1) {
      const t = i / SEG;
      const s1 = Math.sin((1 - t) * ang) / Math.sin(ang);
      const s2 = Math.sin(t * ang) / Math.sin(ang);
      const vx = va[0] * s1 + vb[0] * s2;
      const vy = va[1] * s1 + vb[1] * s2;
      const vz = va[2] * s1 + vb[2] * s2;
      const m = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const e = 1 + haut * Math.sin(Math.PI * t);
      pts.push(projeter([(vx / m) * e, (vy / m) * e, (vz / m) * e]));
    }

    c2.lineWidth = dpr * (actif ? 1.05 : 0.7);
    c2.strokeStyle = actif ? "rgba(112,190,178,0.42)" : "rgba(112,190,178,0.19)";
    c2.beginPath();
    let trace = false;
    for (const q of pts) {
      if (q.k <= -0.12) {
        trace = false;
        continue;
      }
      if (trace) c2.lineTo(q.x, q.y);
      else {
        c2.moveTo(q.x, q.y);
        trace = true;
      }
    }
    c2.stroke();

    if (!actif) return;
    for (let k = 0; k < 2; k += 1) {
      const u = (phase + k * 0.5) % 1;
      const q = pts[Math.floor(u * SEG)];
      if (q === undefined || q.k <= -0.05) continue;
      c2.fillStyle = "rgba(186,240,228,0.92)";
      c2.beginPath();
      c2.arc(q.x, q.y, dpr * 1.5, 0, Math.PI * 2);
      c2.fill();
      c2.fillStyle = "rgba(112,190,178,0.20)";
      c2.beginPath();
      c2.arc(q.x, q.y, dpr * 4.2, 0, Math.PI * 2);
      c2.fill();
    }
  }

  function dessinerPlaces(
    c2: CanvasRenderingContext2D,
    date: Date,
    battement: number,
  ): Place | null {
    let survol: Place | null = null;
    for (const pl of PLACES) {
      const p = projeterLL(pl.lon, pl.lat);
      if (p.k <= 0.02) continue;
      const ouverte = placeOuverte(pl, date);
      const base = ouverte ? "232,197,114" : "120,136,152";

      if (ouverte) {
        c2.fillStyle = `rgba(${base},${(0.24 * (1 - battement)).toFixed(3)})`;
        c2.beginPath();
        c2.arc(p.x, p.y, dpr * (5 + 5 * battement), 0, Math.PI * 2);
        c2.fill();
      }
      c2.fillStyle = `rgba(${base},${ouverte ? 0.98 : 0.55})`;
      c2.beginPath();
      c2.arc(p.x, p.y, dpr * (ouverte ? 2.5 : 1.9), 0, Math.PI * 2);
      c2.fill();

      if (curseur !== null) {
        const dx = curseur.x * dpr - p.x;
        const dy = curseur.y * dpr - p.y;
        const seuil = dpr * 15;
        if (dx * dx + dy * dy < seuil * seuil) survol = pl;
      }

      if (ouverte || survol === pl) {
        c2.font = `${11 * dpr}px 'IBM Plex Mono', ui-monospace, monospace`;
        c2.fillStyle = ouverte ? "rgba(240,220,168,0.86)" : "rgba(170,186,200,0.8)";
        c2.textAlign = "left";
        c2.fillText(pl.id, p.x + dpr * 7, p.y - dpr * 6);
      }
    }
    return survol;
  }

  function limbe(c2: CanvasRenderingContext2D): void {
    c2.lineWidth = dpr * 0.9;
    c2.strokeStyle = "rgba(214,169,80,0.32)";
    c2.beginPath();
    c2.arc(cx, cy, R, 0, Math.PI * 2);
    c2.stroke();
    c2.lineWidth = dpr * 0.5;
    c2.strokeStyle = "rgba(160,196,214,0.10)";
    c2.beginPath();
    c2.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
    c2.stroke();
  }

  let boucle = 0;
  let dernierTemps = 0;

  function image(ts: number): void {
    const dt = dernierTemps === 0 ? 16 : Math.min(64, ts - dernierTemps);
    dernierTemps = ts;
    if (!saisi) lacet += vitesse * (dt / 16);
    if (lacet > 180) lacet -= 360;
    if (lacet < -180) lacet += 360;
    temps += dt / 1000;

    const date = new Date();
    const s = soleil(date);
    const battement = sobre ? 0.35 : Math.sin(temps * 2.1) * 0.5 + 0.5;

    dessin.clearRect(0, 0, toile.width, toile.height);
    halo(dessin);
    corps(dessin);
    grille(dessin);
    continents(dessin, s);
    nuit(dessin, s);

    COULOIRS.forEach(([ida, idb], i) => {
      const a = parId.get(ida);
      const b = parId.get(idb);
      if (a === undefined || b === undefined) return;
      const actif = placeOuverte(a, date) && placeOuverte(b, date);
      arc(dessin, a, b, sobre ? 0.5 : (temps * 0.18 + i * 0.11) % 1, actif);
    });

    const survol = dessinerPlaces(dessin, date, battement);
    limbe(dessin);

    if (options.surEtat !== undefined) {
      let ouvertes = 0;
      for (const pl of PLACES) if (placeOuverte(pl, date)) ouvertes += 1;
      const jour = date.getUTCDay();
      options.surEtat({
        ouvertes,
        total: PLACES.length,
        weekend: jour === 0 || jour === 6,
        utc: date,
        soleilLon: soleilLongitude(date),
        centre: { lat: tangage, lon: lacet },
        survol,
      });
    }
    boucle = requestAnimationFrame(image);
  }

  function pointerDown(e: PointerEvent): void {
    saisi = true;
    dernier = { x: e.clientX, y: e.clientY };
    toile.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent): void {
    const r = toile.getBoundingClientRect();
    curseur = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!saisi || dernier === null) return;
    lacet += (e.clientX - dernier.x) * 0.32;
    tangage = Math.max(-82, Math.min(82, tangage + (e.clientY - dernier.y) * 0.24));
    dernier = { x: e.clientX, y: e.clientY };
  }
  function pointerUp(): void {
    saisi = false;
    dernier = null;
  }
  function pointerLeave(): void {
    saisi = false;
    dernier = null;
    curseur = null;
  }

  toile.addEventListener("pointerdown", pointerDown);
  toile.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  toile.addEventListener("pointerleave", pointerLeave);
  window.addEventListener("resize", redimensionner);

  redimensionner();
  boucle = requestAnimationFrame(image);

  return {
    places: PLACES,
    viserPlace(id: string): void {
      const pl = parId.get(id);
      if (pl === undefined) return;
      lacet = pl.lon;
      tangage = pl.lat;
    },
    basculerRotation(): boolean {
      vitesse = vitesse === 0 ? vitesseParDefaut : 0;
      return vitesse !== 0;
    },
    detruire(): void {
      cancelAnimationFrame(boucle);
      toile.removeEventListener("pointerdown", pointerDown);
      toile.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      toile.removeEventListener("pointerleave", pointerLeave);
      window.removeEventListener("resize", redimensionner);
    },
  };
}
