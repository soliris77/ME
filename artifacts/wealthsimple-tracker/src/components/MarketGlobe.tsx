import React, { useEffect, useRef, useState } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110m from 'world-atlas/land-110m.json';
import { ArrowUpRight, BookOpen, Clock3, LocateFixed, Pause, Play, Sparkles, RotateCw } from 'lucide-react';

// Places à couvrir
const GLOBE_EXCHANGES = [
  { id: "nyse", name: "NYSE / NASDAQ", location: "New York", tz: "America/New_York", open: 9*60+30, close: 16*60, lat: 40.71, lon: -74.00 },
  { id: "tsx", name: "TSX", location: "Toronto", tz: "America/Toronto", open: 9*60+30, close: 16*60, lat: 43.65, lon: -79.38 },
  { id: "lse", name: "LSE", location: "Londres", tz: "Europe/London", open: 8*60, close: 16*60+30, lat: 51.50, lon: -0.12 },
  { id: "xetra", name: "XETRA", location: "Francfort", tz: "Europe/Berlin", open: 9*60, close: 17*60+30, lat: 50.11, lon: 8.68 },
  { id: "euronext", name: "Euronext", location: "Paris", tz: "Europe/Paris", open: 9*60, close: 17*60+30, lat: 48.85, lon: 2.35 },
  { id: "tse", name: "TSE", location: "Tokyo", tz: "Asia/Tokyo", open: 9*60, close: 15*60, pauseStart: 11*60+30, pauseEnd: 12*60+30, lat: 35.67, lon: 139.65 },
  { id: "hkex", name: "HKEX", location: "Hong Kong", tz: "Asia/Hong_Kong", open: 9*60+30, close: 16*60, pauseStart: 12*60, pauseEnd: 13*60, lat: 22.31, lon: 114.16 },
  { id: "asx", name: "ASX", location: "Sydney", tz: "Australia/Sydney", open: 10*60, close: 16*60, lat: -33.86, lon: 151.20 },
];

const HOLIDAYS: Record<string, string[]> = {}; 

type ExStatus = 'open' | 'closed' | 'pre' | 'post' | 'holiday';

export type GlobeSelection = {
  id: string;
  name: string;
  location: string;
  status: ExStatus;
  localTime: string;
};

const STATUS_LABELS: Record<ExStatus, string> = {
  open: "Ouvert",
  closed: "Fermé",
  pre: "Pré-séance",
  post: "Après-séance",
  holiday: "Fermé (férié)"
};

type MarketStory = {
  region: string;
  title: string;
  role: string;
  fact: string;
  lens: string;
};

const MARKET_STORIES: Record<string, MarketStory> = {
  nyse: {
    region: "Amérique du Nord",
    title: "Le cœur du prix mondial",
    role: "Actions américaines · dollar · risque global",
    fact: "Quand New York ouvre, la liquidité mondiale change de gravité : les autres places réagissent à son tempo.",
    lens: "Le réflexe Soliris : comparer le relais de Londres avant de lire la première impulsion américaine.",
  },
  tsx: {
    region: "Amérique du Nord",
    title: "Le baromètre des ressources",
    role: "Banques · énergie · métaux · économie canadienne",
    fact: "Toronto relie les capitaux mondiaux aux matières premières : une place discrète, mais très sensible au cycle réel.",
    lens: "Le réflexe Soliris : surveiller TSX quand le cuivre, le pétrole ou le dollar canadien accélèrent.",
  },
  lse: {
    region: "Europe",
    title: "Le pont entre les fuseaux",
    role: "Finance internationale · devises · capitaux européens",
    fact: "Londres est souvent le passage de relais : l’Europe absorbe l’Asie avant de transmettre le risque à New York.",
    lens: "Le réflexe Soliris : observer Londres comme une boussole de transition, pas seulement comme un indice local.",
  },
  xetra: {
    region: "Europe",
    title: "La force industrielle",
    role: "Industrie · export · ingénierie européenne",
    fact: "Francfort donne une lecture directe du cœur industriel européen et de sa sensibilité aux cycles de taux.",
    lens: "Le réflexe Soliris : confronter XETRA à l’euro et aux marchés obligataires avant de conclure.",
  },
  euronext: {
    region: "Europe",
    title: "Le marché en constellation",
    role: "France · Benelux · Italie · grandes capitalisations",
    fact: "Euronext n’est pas une seule ville : c’est un réseau de places qui agrège plusieurs économies européennes.",
    lens: "Le réflexe Soliris : chercher la tendance commune plutôt que le bruit d’un seul pays.",
  },
  tse: {
    region: "Asie-Pacifique",
    title: "La précision japonaise",
    role: "Technologie · industrie · yen · export",
    fact: "Tokyo ouvre souvent la première grande fenêtre de risque de la journée, avec une profondeur particulière sur l’industrie.",
    lens: "Le réflexe Soliris : lire Tokyo avec le yen — le mouvement de change raconte souvent la moitié de l’histoire.",
  },
  hkex: {
    region: "Asie-Pacifique",
    title: "La porte de la Chine",
    role: "Chine élargie · finance · immobilier · devises",
    fact: "Hong Kong fonctionne comme une interface entre capitaux internationaux et économie chinoise.",
    lens: "Le réflexe Soliris : distinguer le mouvement local du véritable changement de régime asiatique.",
  },
  asx: {
    region: "Asie-Pacifique",
    title: "Le premier signal du jour",
    role: "Matières premières · banques · Australie",
    fact: "Sydney est l’un des premiers éclats du cycle mondial : les matières premières y parlent avant l’Europe.",
    lens: "Le réflexe Soliris : utiliser Sydney comme signal d’ambiance, jamais comme verdict isolé.",
  },
};

function getGlobalPhase(openMarkets: typeof GLOBE_EXCHANGES, visibleMarkets: typeof GLOBE_EXCHANGES) {
  const openIds = new Set(openMarkets.map((market) => market.id));
  if (openMarkets.length === 0) {
    return {
      eyebrow: "VEILLE MONDIALE",
      title: "Le silence n’est jamais vide",
      description: "Les carnets se taisent, mais le prochain relais se prépare déjà.",
      tone: "rest",
    };
  }
  if (openIds.has("nyse") && openIds.has("lse")) {
    return {
      eyebrow: "PONT ATLANTIQUE",
      title: "Le monde change de main",
      description: "New York et Londres sont ouvertes : c’est ici que les récits de marché se confrontent.",
      tone: "active",
    };
  }
  if (openIds.has("tse") || openIds.has("hkex") || openIds.has("asx")) {
    return {
      eyebrow: "RELAIS ASIE-PACIFIQUE",
      title: "Le premier battement",
      description: "L’Asie donne le ton pendant que les autres fuseaux se mettent en mouvement.",
      tone: "dawn",
    };
  }
  return {
    eyebrow: visibleMarkets.length > openMarkets.length ? "TRANSITION DE SÉANCE" : "MARCHÉ EN MOUVEMENT",
    title: "La liquidité circule",
    description: "Chaque ouverture est un passage de relais, jamais un événement isolé.",
    tone: "active",
  };
}

function getExchangeState(ex: typeof GLOBE_EXCHANGES[0]) {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ex.tz, hour: '2-digit', minute: '2-digit'
  }).format(now);
  
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: ex.tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);

  if (HOLIDAYS[ex.id]?.includes(dateStr)) return { status: 'holiday' as ExStatus, localTimeStr: timeStr };

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ex.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);

  const dow = parts.find(p => p.type === 'weekday')?.value;
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const mins = h * 60 + m;

  if (dow === 'Sat' || dow === 'Sun') return { status: 'closed' as ExStatus, localTimeStr: timeStr };

  if (ex.pauseStart && ex.pauseEnd && mins >= ex.pauseStart && mins < ex.pauseEnd) {
    return { status: 'closed' as ExStatus, localTimeStr: timeStr };
  }

  if (mins >= ex.open && mins < ex.close) return { status: 'open' as ExStatus, localTimeStr: timeStr };
  
  if (mins >= ex.open - 60 && mins < ex.open) return { status: 'pre' as ExStatus, localTimeStr: timeStr };
  if (mins >= ex.close && mins < ex.close + 60) return { status: 'post' as ExStatus, localTimeStr: timeStr };

  return { status: 'closed' as ExStatus, localTimeStr: timeStr };
}

// Natural Earth 110m: authentic coastlines at a compact size suitable for this globe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WORLD_LAND = feature(land110m as any, (land110m as any).objects.land);
const GRATICULE = geoGraticule10();

export default function MarketGlobe({
  variant = 'compact',
  interactive = true,
  onSelectionChange,
}: {
  variant?: 'hero' | 'compact';
  interactive?: boolean;
  onSelectionChange?: (selection: GlobeSelection) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const rotationRef = useRef(0);
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const pointerTravelRef = useRef(0);
  const clickWaveRef = useRef<{ targetId: string | null; startedAt: number }>({
    targetId: null,
    startedAt: 0,
  });
  const pointerPositionRef = useRef({ x: 0, y: 0 });
  const resumeTimerRef = useRef<number | null>(null);
  const scanStartedAtRef = useRef(0);
  const lastDrawAtRef = useRef(0);
  const userPausedRef = useRef(false);
  const activityIdsRef = useRef<string[]>([]);
  const selectedExchangeIdRef = useRef<string | null>(null);
  const pointerInsideRef = useRef(false);
  const autoRotateRef = useRef(true);
  const isVisibleRef = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [rotationMode, setRotationMode] = useState<'auto' | 'manual' | 'paused'>('auto');
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(variant === 'hero' ? 'nyse' : null);
  const [hoveredExchangeId, setHoveredExchangeId] = useState<string | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);
  
  const [states, setStates] = useState<Record<string, ReturnType<typeof getExchangeState>>>(() => {
    const init: any = {};
    GLOBE_EXCHANGES.forEach(ex => init[ex.id] = getExchangeState(ex));
    return init;
  });

  useEffect(() => {
    scanStartedAtRef.current = performance.now();
    const id = setInterval(() => {
      const next: any = {};
      GLOBE_EXCHANGES.forEach(ex => next[ex.id] = getExchangeState(ex));
      setStates(next);
      scanStartedAtRef.current = performance.now();
    }, 60000);
    return () => {
      clearInterval(id);
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const projection = geoOrthographic().clipAngle(90).precision(0.7);
    let lastTime = performance.now();
    let reqId: number | null = null;
    let mounted = true;

    const loop = (time: number) => {
      reqId = null;
      
      if (!mounted || document.hidden || !isVisibleRef.current) {
        lastTime = time;
        return;
      }
      reqId = requestAnimationFrame(loop);

      const dt = time - lastTime;
      lastTime = time;

      const isReduced = prefersReduced.matches;
      if (!interactive && time - lastDrawAtRef.current < 1000 / 30) return;
      lastDrawAtRef.current = time;
      const animationTime = isReduced ? 0 : time;
      if (isReduced) {
        const offset = new Date().getTimezoneOffset(); // in minutes
        rotationRef.current = -(offset / 60) * 15;
      } else if (!dragRef.current.active && autoRotateRef.current) {
         rotationRef.current += (dt / 1000) * 3.5; // ~103s revolution: slow, global and cinematic
      }

      rotationRef.current %= 360;
      const rot = rotationRef.current;

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(w * dpr));
      const pixelHeight = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const RADIUS = Math.min(w, h) / 2 * 0.85;
       const moonAngle = (animationTime / 11000) * Math.PI * 2 - Math.PI / 2;
       const moonOrbitX = RADIUS * 1.08;
       const moonOrbitY = RADIUS * 0.58;
       const moonDepth = Math.sin(moonAngle);
       const moonX = w / 2 + Math.cos(moonAngle) * moonOrbitX;
       const moonY = h / 2 + Math.sin(moonAngle) * moonOrbitY;
       const moonRadius = RADIUS * (0.085 + ((moonDepth + 1) / 2) * 0.035);

       const drawMoon = () => {
         if (!pointerInsideRef.current || !interactive) return;
         ctx.save();
         const glow = ctx.createRadialGradient(
           moonX,
           moonY,
           moonRadius * 0.5,
           moonX,
           moonY,
           moonRadius * 2.8,
         );
         glow.addColorStop(0, 'rgba(245, 224, 157, 0.3)');
         glow.addColorStop(0.45, 'rgba(112, 160, 186, 0.13)');
         glow.addColorStop(1, 'rgba(112, 160, 186, 0)');
         ctx.fillStyle = glow;
         ctx.beginPath();
         ctx.arc(moonX, moonY, moonRadius * 2.8, 0, Math.PI * 2);
         ctx.fill();

         ctx.beginPath();
         ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
         ctx.clip();
         const light = ctx.createRadialGradient(
           moonX - moonRadius * 0.35,
           moonY - moonRadius * 0.4,
           moonRadius * 0.05,
           moonX,
           moonY,
           moonRadius * 1.15,
         );
         light.addColorStop(0, 'rgba(255, 247, 205, 1)');
         light.addColorStop(0.5, 'rgba(190, 179, 137, 0.98)');
         light.addColorStop(0.82, 'rgba(111, 103, 79, 0.96)');
         light.addColorStop(1, 'rgba(35, 34, 29, 1)');
         ctx.fillStyle = light;
         ctx.fillRect(moonX - moonRadius, moonY - moonRadius, moonRadius * 2, moonRadius * 2);

         const craterPhase = animationTime / 1600;
         const craters = [
           [-0.26, -0.22, 0.13],
           [0.2, -0.02, 0.18],
           [-0.08, 0.28, 0.1],
           [0.34, 0.3, 0.08],
         ];
         craters.forEach(([x, y, size], index) => {
           const rotation = craterPhase * 0.08 + index;
           const craterX = moonX + (x * Math.cos(rotation) - y * Math.sin(rotation)) * moonRadius;
           const craterY = moonY + (x * Math.sin(rotation) + y * Math.cos(rotation)) * moonRadius;
           ctx.fillStyle = 'rgba(72, 67, 52, 0.36)';
           ctx.beginPath();
           ctx.arc(craterX, craterY, moonRadius * size, 0, Math.PI * 2);
           ctx.fill();
           ctx.strokeStyle = 'rgba(255, 241, 185, 0.18)';
           ctx.lineWidth = Math.max(0.5, moonRadius * 0.025);
           ctx.stroke();
         });
         ctx.restore();
       };

       if (pointerInsideRef.current && interactive) {
         ctx.save();
         ctx.beginPath();
         ctx.ellipse(w / 2, h / 2, moonOrbitX, moonOrbitY, 0, 0, Math.PI * 2);
         ctx.strokeStyle = 'rgba(224, 197, 119, 0.25)';
         ctx.lineWidth = variant === 'hero' ? 1 : 0.6;
         ctx.setLineDash([3, 8]);
         ctx.stroke();
         ctx.setLineDash([]);
         ctx.restore();
       }
       if (pointerInsideRef.current && moonDepth < 0) drawMoon();

      projection
        .translate([w / 2, h / 2])
        .scale(RADIUS)
        .rotate([rot, -12, 0]);
      const path = geoPath(projection, ctx);

      // Draw base globe with a restrained atmosphere and dimensional light
      const atmosphere = ctx.createRadialGradient(
        w * 0.42, h * 0.36, RADIUS * 0.08,
        w / 2, h / 2, RADIUS * 1.08,
      );
      atmosphere.addColorStop(0, 'rgba(55, 68, 88, 0.96)');
      atmosphere.addColorStop(0.68, 'rgba(15, 20, 30, 0.99)');
      atmosphere.addColorStop(1, 'rgba(3, 5, 9, 1)');
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = atmosphere;
      ctx.fill();

      // Outer rim light
      ctx.lineWidth = variant === 'hero' ? 2 : 1;
      ctx.strokeStyle = 'rgba(212, 167, 44, 0.2)';
      ctx.shadowColor = 'rgba(212, 167, 44, 0.22)';
      ctx.shadowBlur = variant === 'hero' ? 18 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const now = new Date();
      const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
      const sunLon = -(utcHour - 12) * 15;
      const pointerLightX = pointerInsideRef.current
        ? Math.max(w * 0.18, Math.min(w * 0.82, pointerPositionRef.current.x))
        : w * 0.42;
      const pointerLightY = pointerInsideRef.current
        ? Math.max(h * 0.18, Math.min(h * 0.82, pointerPositionRef.current.y))
        : h * 0.36;

      // Subtle geographic grid follows the sphere and reinforces its volume.
      ctx.save();
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.clip();
      ctx.beginPath();
      path(GRATICULE);
      ctx.strokeStyle = 'rgba(212, 167, 44, 0.055)';
      ctx.lineWidth = variant === 'hero' ? 0.65 : 0.4;
      ctx.stroke();

      const sunPoint = projection([sunLon, 10]) ?? [w * 0.35, h * 0.35];
      const lightPoint = pointerInsideRef.current
        ? [
            sunPoint[0] * 0.82 + pointerLightX * 0.18,
            sunPoint[1] * 0.82 + pointerLightY * 0.18,
          ]
        : sunPoint;
      const landLight = ctx.createRadialGradient(
        lightPoint[0], lightPoint[1], RADIUS * 0.03,
        lightPoint[0], lightPoint[1], RADIUS * 1.75,
      );
      landLight.addColorStop(0, 'rgb(130, 124, 78)');
      landLight.addColorStop(0.42, 'rgb(83, 91, 58)');
      landLight.addColorStop(0.74, 'rgb(48, 60, 43)');
      landLight.addColorStop(1, 'rgb(21, 29, 25)');

      ctx.beginPath();
      path(WORLD_LAND);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
      ctx.shadowBlur = variant === 'hero' ? 7 : 3;
      ctx.shadowOffsetY = variant === 'hero' ? 3 : 1;
      ctx.fillStyle = landLight;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      path(WORLD_LAND);
      ctx.strokeStyle = 'rgba(224, 205, 145, 0.34)';
      ctx.lineWidth = variant === 'hero' ? 0.9 : 0.55;
      ctx.stroke();

      // Day/night falloff moves independently of the rotating Earth.
      const night = ctx.createRadialGradient(
        sunPoint[0], sunPoint[1], RADIUS * 0.12,
        sunPoint[0], sunPoint[1], RADIUS * 1.85,
      );
      night.addColorStop(0, 'rgba(2, 5, 10, 0)');
      night.addColorStop(0.52, 'rgba(2, 5, 10, 0.08)');
      night.addColorStop(0.78, 'rgba(2, 5, 10, 0.38)');
      night.addColorStop(1, 'rgba(2, 5, 10, 0.76)');
      ctx.fillStyle = night;
      ctx.fillRect(w / 2 - RADIUS, h / 2 - RADIUS, RADIUS * 2, RADIUS * 2);
      ctx.restore();

       const scanAge = isReduced ? Infinity : (time - scanStartedAtRef.current) / 1000;
       if (variant === 'hero' && scanAge >= 0 && scanAge < 1.8) {
         const scanProgress = scanAge / 1.8;
         const scanY = h / 2 - RADIUS + scanProgress * RADIUS * 2;
         ctx.save();
         ctx.beginPath();
         path({ type: 'Sphere' });
         ctx.clip();
         const scanGradient = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
         scanGradient.addColorStop(0, 'rgba(201, 162, 39, 0)');
         scanGradient.addColorStop(0.5, 'rgba(242, 210, 126, 0.2)');
         scanGradient.addColorStop(1, 'rgba(201, 162, 39, 0)');
         ctx.fillStyle = scanGradient;
         ctx.fillRect(w / 2 - RADIUS, scanY - 10, RADIUS * 2, 20);
         ctx.restore();
       }

       if (pointerInsideRef.current && moonDepth >= 0) drawMoon();

      // Update interactive points
      const center = projection.invert?.([w / 2, h / 2]) ?? [0, 0];

       // A click sends a visible pulse from the first currently open relay.
       // This is intentionally based on session state, not an invented volume.
       const wave = clickWaveRef.current;
       const leader = GLOBE_EXCHANGES.find((exchange) => exchange.id === wave.targetId);
        const waveAge = isReduced ? 0 : (time - wave.startedAt) / 1000;
       if (leader && waveAge >= 0 && waveAge < 4) {
         const leaderPoint = projection([leader.lon, leader.lat]);
         if (leaderPoint) {
           ctx.save();
           ctx.globalCompositeOperation = 'lighter';
           for (let ring = 0; ring < 3; ring += 1) {
             const progress = (waveAge * 0.32 + ring * 0.25) % 1;
             const alpha = (1 - progress) * 0.5;
             const radius = 7 + progress * RADIUS * 0.34;
             ctx.beginPath();
             ctx.arc(leaderPoint[0], leaderPoint[1], radius, 0, Math.PI * 2);
             ctx.strokeStyle = `rgba(242, 210, 126, ${alpha.toFixed(3)})`;
             ctx.lineWidth = variant === 'hero' ? 1.5 : 1;
             ctx.stroke();
           }

           activityIdsRef.current.forEach((id, index) => {
             if (id === leader.id) return;
             const destination = GLOBE_EXCHANGES.find((exchange) => exchange.id === id);
             const destinationPoint = destination
               ? projection([destination.lon, destination.lat])
               : null;
             if (!destinationPoint) return;
             ctx.beginPath();
             ctx.moveTo(leaderPoint[0], leaderPoint[1]);
             ctx.lineTo(destinationPoint[0], destinationPoint[1]);
             ctx.setLineDash([3 + index * 1.5, 8]);
             ctx.strokeStyle = `rgba(129, 201, 205, ${(0.24 * (1 - waveAge / 4)).toFixed(3)})`;
             ctx.lineWidth = variant === 'hero' ? 1 : 0.6;
             ctx.stroke();
           });
           ctx.setLineDash([]);
           ctx.restore();
         }
       }

      GLOBE_EXCHANGES.forEach(ex => {
        const p = projection([ex.lon, ex.lat]);
        const el = pointsRef.current[ex.id];
        if (el && p) {
          const isFront = geoDistance([ex.lon, ex.lat], center) <= Math.PI / 2;
          if (isFront) {
            el.style.display = 'block';
            el.style.transform = `translate(-50%, -50%) translate(${p[0]}px, ${p[1]}px)`;
            el.style.opacity = '1';
            el.style.zIndex = '10';
          } else {
            el.style.display = 'none';
          }
        }
      });
      
    };

    const startLoop = () => {
      if (mounted && !document.hidden && isVisibleRef.current && reqId === null) {
        lastTime = performance.now();
        reqId = requestAnimationFrame(loop);
      }
    };
    const stopLoop = () => {
      if (reqId !== null) {
        cancelAnimationFrame(reqId);
        reqId = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          isVisibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) startLoop();
          else stopLoop();
        }, { threshold: 0.01 });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (observer && containerRef.current) observer.observe(containerRef.current);
    startLoop();

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer?.disconnect();
      stopLoop();
    };
  }, [interactive, variant]);

  const clearResumeTimer = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  const scheduleAutoResume = () => {
    if (!interactive || userPausedRef.current) return;
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(() => {
      autoRotateRef.current = true;
      setRotationMode('auto');
      resumeTimerRef.current = null;
    }, 4200);
  };

  const updatePointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.button !== 0) return;
    clearResumeTimer();
    updatePointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { active: true, lastX: event.clientX, lastY: event.clientY };
    pointerTravelRef.current = 0;
    setIsDragging(true);
    autoRotateRef.current = false;
    setRotationMode('manual');
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    updatePointerPosition(event);
    pointerInsideRef.current = true;
    setIsPointerInside(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    updatePointerPosition(event);
    if (!dragRef.current.active) return;
    const deltaX = event.clientX - dragRef.current.lastX;
    const deltaY = event.clientY - dragRef.current.lastY;
    pointerTravelRef.current += Math.abs(deltaX) + Math.abs(deltaY);
    rotationRef.current += deltaX * 0.42;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 1) event.preventDefault();
  };

  const handlePointerLeave = () => {
    if (!interactive) return;
    pointerInsideRef.current = false;
    setIsPointerInside(false);
    setHoveredExchangeId(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    // Empty-surface clicks only pause/reposition the globe; a signal is
    // emitted by focusExchange after an explicit node selection.
    scheduleAutoResume();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleRotateButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    rotationRef.current += 72;
    autoRotateRef.current = false;
    setRotationMode('manual');
    scheduleAutoResume();
  };

  const handleRecenter = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearResumeTimer();
    rotationRef.current = 0;
    clickWaveRef.current = { targetId: null, startedAt: 0 };
    if (userPausedRef.current) {
      autoRotateRef.current = false;
      setRotationMode('paused');
    } else {
      autoRotateRef.current = true;
      setRotationMode('auto');
    }
  };

  const handleToggleRotation = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearResumeTimer();
    const next = !autoRotateRef.current;
    autoRotateRef.current = next;
    userPausedRef.current = !next;
    setRotationMode(next ? 'auto' : 'paused');
  };

  const focusExchange = (id: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    const exchange = GLOBE_EXCHANGES.find((item) => item.id === id);
    if (!exchange) return;
    rotationRef.current = -exchange.lon;
    autoRotateRef.current = false;
    clickWaveRef.current = states[id]?.status === 'open'
      ? { targetId: id, startedAt: performance.now() }
      : { targetId: null, startedAt: 0 };
    setSelectedExchangeId(id);
    onSelectionChange?.({
      id: exchange.id,
      name: exchange.name,
      location: exchange.location,
      status: states[id]?.status ?? 'closed',
      localTime: states[id]?.localTimeStr ?? '—',
    });
    setRotationMode('manual');
    scheduleAutoResume();
  };

  const getDotClass = (status: ExStatus) => {
    switch(status) {
      case 'open': return 'bg-primary shadow-[0_0_10px_1px_hsl(var(--primary))]';
      case 'pre':
      case 'post': return 'bg-primary/40';
      case 'closed':
      case 'holiday': return 'bg-muted-foreground/40';
    }
  };

  const marketRows = GLOBE_EXCHANGES
    .map((exchange) => ({ exchange, state: states[exchange.id] }))
    .filter((row): row is { exchange: typeof GLOBE_EXCHANGES[number]; state: ReturnType<typeof getExchangeState> } => Boolean(row.state));
  const openMarkets = marketRows.filter(({ state }) => state.status === 'open');
  const visibleMarkets = marketRows.filter(({ state }) => state.status === 'open' || state.status === 'pre' || state.status === 'post');
  activityIdsRef.current = openMarkets.map(({ exchange }) => exchange.id);
  selectedExchangeIdRef.current = selectedExchangeId;
  const selectedExchange = GLOBE_EXCHANGES.find((exchange) => exchange.id === selectedExchangeId);
  const selectedState = selectedExchangeId ? states[selectedExchangeId] : undefined;
  const selectedStory = selectedExchangeId ? MARKET_STORIES[selectedExchangeId] : undefined;
  const activeExchangeId = hoveredExchangeId ?? selectedExchangeId;
  const activeExchange = GLOBE_EXCHANGES.find((exchange) => exchange.id === activeExchangeId);
  const activeState = activeExchangeId ? states[activeExchangeId] : undefined;
  const activeStory = activeExchangeId ? MARKET_STORIES[activeExchangeId] : undefined;
  const globalPhase = getGlobalPhase(
    openMarkets.map(({ exchange }) => exchange),
    visibleMarkets.map(({ exchange }) => exchange),
  );
  const utcLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`globe-vitality relative mx-auto h-full w-full select-none touch-none ${
        variant === 'hero' ? 'max-w-[700px] aspect-square' : 'aspect-square max-h-full'
      }`}
      data-market-phase={variant === 'hero' ? globalPhase.tone : undefined}
      style={{ cursor: interactive ? (isDragging ? 'grabbing' : 'grab') : 'default', pointerEvents: interactive ? 'auto' : 'none' }}
      aria-label="Globe interactif et encyclopédie des places boursières. Faites glisser pour le faire tourner."
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      <ul className="sr-only" aria-label="Sélectionner une place boursière">
        {GLOBE_EXCHANGES.map(ex => (
          <li key={ex.id}>
            <button
              type="button"
              onFocus={() => setHoveredExchangeId(ex.id)}
              onBlur={() => setHoveredExchangeId(null)}
              onClick={(event) => focusExchange(ex.id, event)}
              aria-pressed={selectedExchangeId === ex.id}
            >
              {ex.location}, {ex.name}, {states[ex.id]?.localTimeStr} heure locale, {STATUS_LABELS[states[ex.id]?.status]}
            </button>
          </li>
        ))}
      </ul>

      {GLOBE_EXCHANGES.map((ex, index) => {
        const st = states[ex.id];
        if (!st) return null;
        
        return (
          <button
            key={ex.id}
            ref={el => { pointsRef.current[ex.id] = el; }}
            className="absolute top-0 left-0 group outline-none cursor-pointer"
            style={{ display: 'none' }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseEnter={() => setHoveredExchangeId(ex.id)}
            onMouseLeave={() => setHoveredExchangeId(null)}
             onFocus={() => setHoveredExchangeId(ex.id)}
             onBlur={() => setHoveredExchangeId(null)}
            onClick={(event) => focusExchange(ex.id, event)}
            aria-label={`${ex.location}, ${ex.name}, ${st.localTimeStr} heure locale, ${STATUS_LABELS[st.status]}`}
             aria-pressed={selectedExchangeId === ex.id}
          >
             <div
               className={`globe-market-point rounded-full transition-all duration-500 ease-in-out relative ${st.status === 'open' ? 'globe-market-point-open' : ''} ${variant === 'hero' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} ${getDotClass(st.status)}`}
               style={{ animationDelay: `${(index % 6) * 0.42}s` }}
             >
                {st.status === 'open' && (
                  <div className="globe-halo" style={{ animationDelay: `${(index % 6) * 0.42}s` }} />
                )}
            </div>
            
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max bg-card/95 border border-border/50 shadow-xl backdrop-blur-md rounded-md px-3 py-2 text-xs opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none transition-opacity z-50">
              <div className="font-bold text-foreground tracking-wide">{ex.location} <span className="text-muted-foreground font-normal ml-1">({ex.name})</span></div>
              <div className="text-muted-foreground mt-1 font-mono text-[10px] uppercase tracking-widest">{st.localTimeStr} <span className="opacity-50">locale</span></div>
              <div className={`mt-1 font-bold text-[10px] uppercase tracking-widest ${st.status === 'open' ? 'text-primary' : 'text-muted-foreground/80'}`}>
                {STATUS_LABELS[st.status]}
              </div>
              <div className="mt-1 max-w-[190px] whitespace-normal text-[10px] leading-relaxed text-muted-foreground">
                {MARKET_STORIES[ex.id]?.role}
              </div>
            </div>
          </button>
        );
      })}

      {variant === 'hero' && (
        <>
          <div
            className={`globe-hover-panel absolute left-[1%] top-[13%] z-30 w-[188px] rounded-xl border border-primary/25 bg-background/72 p-3 text-left shadow-2xl backdrop-blur-md sm:left-[2%] sm:w-[208px] ${isPointerInside ? 'globe-hover-panel-visible' : ''}`}
            aria-live="polite"
          >
            <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-primary/85">
              <Sparkles className="h-3 w-3" />
              {globalPhase.eyebrow}
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="text-[13px] font-semibold leading-tight text-foreground">
                {globalPhase.title}
              </div>
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/75" />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {globalPhase.description}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{openMarkets.length} ouverts</span>
              <span>{visibleMarkets.length} sur le relais</span>
            </div>
            {activeExchange && activeState && activeStory && (
              <div className="mt-3 border-t border-primary/15 pt-2.5">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <LocateFixed className="h-3 w-3" />
                  {activeExchange.location}
                </div>
                <div className="mt-1 text-[11px] font-medium leading-tight text-foreground">
                  {activeStory.title}
                </div>
                <div className="mt-1 text-[8px] uppercase tracking-[0.1em] text-primary/65">
                  {activeStory.role}
                </div>
                <div className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {activeStory.fact}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[8px] uppercase tracking-[0.1em]">
                  <span className={activeState.status === 'open' ? 'text-emerald-400' : 'text-primary/75'}>
                    {STATUS_LABELS[activeState.status]}
                  </span>
                  <span className="text-muted-foreground">{activeStory.region}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[8px] leading-relaxed text-primary/75">
                  <ArrowUpRight className="h-3 w-3 shrink-0" />
                  {activeStory.lens}
                </div>
              </div>
            )}
          </div>
          <div className={`globe-hover-panel globe-live-dock absolute bottom-[21%] right-[2%] z-30 w-[174px] rounded-xl border border-primary/30 bg-background/75 p-2.5 text-left shadow-2xl backdrop-blur-md sm:right-[3%] sm:w-[198px] sm:p-3 ${isPointerInside ? 'globe-hover-panel-visible' : ''}`} aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">Marchés en direct</span>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.35)]" />
                {openMarkets.length}/{GLOBE_EXCHANGES.length}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <Clock3 className="h-3 w-3 text-primary/70" />
              UTC {utcLabel}
            </div>
            <div className="mt-2 text-[8px] uppercase tracking-[0.14em] text-primary/70">
              Cliquer un nœud pour l’explorer
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visibleMarkets.slice(0, 4).map(({ exchange, state }) => (
                <button
                  key={exchange.id}
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseEnter={() => setHoveredExchangeId(exchange.id)}
                  onMouseLeave={() => setHoveredExchangeId(null)}
                  onFocus={() => setHoveredExchangeId(exchange.id)}
                  onBlur={() => setHoveredExchangeId(null)}
                  onClick={(event) => focusExchange(exchange.id, event)}
                  tabIndex={isPointerInside ? 0 : -1}
                  aria-pressed={selectedExchangeId === exchange.id}
                  className={`rounded-full border px-2 py-1 text-[9px] font-medium transition-colors ${
                    selectedExchangeId === exchange.id
                      ? 'border-primary/70 bg-primary/15 text-primary'
                      : 'border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-primary'
                  }`}
                  title={`${exchange.name} — ${STATUS_LABELS[state.status]}`}
                >
                  {exchange.id.toUpperCase()}
                </button>
              ))}
            </div>
            {activeExchange && activeState && (
              <div className="mt-3 border-t border-border/50 pt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
                  <LocateFixed className="h-3 w-3 text-primary" />
                  {activeExchange.location}
                </div>
                <div className="mt-1 text-[9px] text-muted-foreground">
                  {activeExchange.name} · {activeState.localTimeStr}
                </div>
                <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${activeState.status === 'open' ? 'text-emerald-400' : 'text-primary'}`}>
                  {STATUS_LABELS[activeState.status]}
                </div>
              </div>
            )}
          </div>
          <div className="globe-control-console absolute bottom-[5%] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-primary/25 bg-background/72 p-1 shadow-xl backdrop-blur-md" role="group" aria-label="Contrôles du globe">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleToggleRotation}
              className="globe-control-button"
              aria-label={autoRotateRef.current ? 'Mettre la rotation en pause' : 'Reprendre la rotation automatique'}
            >
              {autoRotateRef.current ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span className="hidden sm:inline">{autoRotateRef.current ? 'Pause' : 'Auto'}</span>
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleRotateButton}
              className="globe-control-button"
              aria-label="Tourner le globe"
            >
              <RotateCw className="h-3 w-3" />
              <span className="hidden sm:inline">Tourner</span>
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleRecenter}
              className="globe-control-button"
              aria-label="Recentrer le globe"
            >
              <LocateFixed className="h-3 w-3" />
              <span className="hidden sm:inline">Recentrer</span>
            </button>
          </div>
          <div className="pointer-events-none absolute bottom-[1.5%] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap text-[8px] uppercase tracking-[0.18em] text-primary/60">
            {rotationMode === 'manual' ? 'Vue sélectionnée' : rotationMode === 'paused' ? 'Rotation en pause' : 'Rotation automatique'}
          </div>
        </>
      )}
    </div>
  );
}
