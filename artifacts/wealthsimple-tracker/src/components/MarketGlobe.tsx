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

export default function MarketGlobe({ variant = 'compact' }: { variant?: 'hero' | 'compact' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const rotationRef = useRef(0);
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const autoRotateRef = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [rotationMode, setRotationMode] = useState<'auto' | 'manual' | 'paused'>('auto');
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(variant === 'hero' ? 'nyse' : null);
  
  const [states, setStates] = useState<Record<string, ReturnType<typeof getExchangeState>>>(() => {
    const init: any = {};
    GLOBE_EXCHANGES.forEach(ex => init[ex.id] = getExchangeState(ex));
    return init;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const next: any = {};
      GLOBE_EXCHANGES.forEach(ex => next[ex.id] = getExchangeState(ex));
      setStates(next);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const projection = geoOrthographic().clipAngle(90).precision(0.7);
    let lastTime = performance.now();
    let reqId: number;

    const loop = (time: number) => {
      reqId = requestAnimationFrame(loop);
      
      if (document.hidden) {
        lastTime = time;
        return;
      }

      const dt = time - lastTime;
      lastTime = time;

      const isReduced = prefersReduced.matches;
      if (isReduced) {
        const offset = new Date().getTimezoneOffset(); // in minutes
        rotationRef.current = -(offset / 60) * 15;
      } else if (!dragRef.current.active && autoRotateRef.current) {
        rotationRef.current += (dt / 1000) * 9; // 40s revolution: visibly alive, still cinematic
      }

      rotationRef.current %= 360;
      const rot = rotationRef.current;

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      const RADIUS = Math.min(w, h) / 2 * 0.85;
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
      const landLight = ctx.createRadialGradient(
        sunPoint[0], sunPoint[1], RADIUS * 0.03,
        sunPoint[0], sunPoint[1], RADIUS * 1.75,
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

      // Update interactive points
      const center = projection.invert?.([w / 2, h / 2]) ?? [0, 0];
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

    reqId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqId);
  }, [variant]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { active: true, lastX: event.clientX, lastY: event.clientY };
    setIsDragging(true);
    autoRotateRef.current = false;
    setRotationMode('manual');
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const deltaX = event.clientX - dragRef.current.lastX;
    const deltaY = event.clientY - dragRef.current.lastY;
    rotationRef.current += deltaX * 0.42;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 1) event.preventDefault();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleRotateButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    rotationRef.current += 72;
    autoRotateRef.current = false;
    setRotationMode('manual');
  };

  const handleToggleRotation = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const next = !autoRotateRef.current;
    autoRotateRef.current = next;
    setRotationMode(next ? 'auto' : 'paused');
  };

  const focusExchange = (id: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    const exchange = GLOBE_EXCHANGES.find((item) => item.id === id);
    if (!exchange) return;
    rotationRef.current = -exchange.lon;
    autoRotateRef.current = false;
    setSelectedExchangeId(id);
    setRotationMode('manual');
  };

  const getDotClass = (status: ExStatus) => {
    switch(status) {
      case 'open': return 'bg-primary shadow-[0_0_10px_1px_hsl(var(--primary))] motion-safe:animate-pulse';
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
  const selectedExchange = GLOBE_EXCHANGES.find((exchange) => exchange.id === selectedExchangeId);
  const selectedState = selectedExchangeId ? states[selectedExchangeId] : undefined;
  const selectedStory = selectedExchangeId ? MARKET_STORIES[selectedExchangeId] : undefined;
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
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`globe-vitality relative mx-auto h-full w-full select-none touch-none ${
        variant === 'hero' ? 'max-w-[700px] aspect-square' : 'aspect-square max-h-full'
      }`}
      data-market-phase={variant === 'hero' ? globalPhase.tone : undefined}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      aria-label="Globe interactif et encyclopédie des places boursières. Faites glisser pour le faire tourner."
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      
      <ul className="sr-only">
        {GLOBE_EXCHANGES.map(ex => (
          <li key={ex.id}>{ex.location}, {ex.name}, {states[ex.id]?.localTimeStr} heure locale, {STATUS_LABELS[states[ex.id]?.status]}</li>
        ))}
      </ul>

      {GLOBE_EXCHANGES.map(ex => {
        const st = states[ex.id];
        if (!st) return null;
        
        return (
          <button
            key={ex.id}
            ref={el => { pointsRef.current[ex.id] = el; }}
            className="absolute top-0 left-0 group outline-none cursor-pointer"
            style={{ display: 'none' }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => focusExchange(ex.id, event)}
            aria-label={`${ex.location}, ${ex.name}, ${st.localTimeStr} heure locale, ${STATUS_LABELS[st.status]}`}
          >
            <div className={`rounded-full transition-all duration-500 ease-in-out relative ${variant === 'hero' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} ${getDotClass(st.status)}`}>
               {st.status === 'open' && <div className="globe-halo" />}
            </div>
            
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max bg-card/95 border border-border/50 shadow-xl backdrop-blur-md rounded-md px-3 py-2 text-xs opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none transition-opacity z-50">
              <div className="font-bold text-foreground tracking-wide">{ex.location} <span className="text-muted-foreground font-normal ml-1">({ex.name})</span></div>
              <div className="text-muted-foreground mt-1 font-mono text-[10px] uppercase tracking-widest">{st.localTimeStr} <span className="opacity-50">locale</span></div>
              <div className={`mt-1 font-bold text-[10px] uppercase tracking-widest ${st.status === 'open' ? 'text-primary' : 'text-muted-foreground/80'}`}>
                {STATUS_LABELS[st.status]}
              </div>
            </div>
          </button>
        );
      })}

      {variant === 'hero' && (
        <>
          <div
            className="absolute left-[1%] top-[13%] z-30 w-[188px] rounded-xl border border-primary/25 bg-background/72 p-3 text-left shadow-2xl backdrop-blur-md sm:left-[2%] sm:w-[208px]"
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
            {selectedExchange && selectedState && selectedStory && (
              <div className="mt-3 border-t border-primary/15 pt-2.5">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <LocateFixed className="h-3 w-3" />
                  {selectedExchange.location}
                </div>
                <div className="mt-1 text-[11px] font-medium leading-tight text-foreground">
                  {selectedStory.title}
                </div>
                <div className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {selectedStory.fact}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[8px] uppercase tracking-[0.1em]">
                  <span className={selectedState.status === 'open' ? 'text-emerald-400' : 'text-primary/75'}>
                    {STATUS_LABELS[selectedState.status]}
                  </span>
                  <span className="text-muted-foreground">{selectedStory.region}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[8px] leading-relaxed text-primary/75">
                  <ArrowUpRight className="h-3 w-3 shrink-0" />
                  {selectedStory.lens}
                </div>
              </div>
            )}
          </div>
          <div className="absolute right-[2%] top-[13%] z-30 w-[165px] rounded-xl border border-primary/20 bg-background/65 p-2.5 text-left shadow-2xl backdrop-blur-md sm:right-[3%] sm:top-[14%] sm:w-[190px] sm:p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">Nœuds en direct</span>
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
                  onClick={(event) => focusExchange(exchange.id, event)}
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
            {selectedExchange && selectedState && (
              <div className="mt-3 border-t border-border/50 pt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
                  <LocateFixed className="h-3 w-3 text-primary" />
                  {selectedExchange.location}
                </div>
                <div className="mt-1 text-[9px] text-muted-foreground">
                  {selectedExchange.name} · {selectedState.localTimeStr}
                </div>
                <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${selectedState.status === 'open' ? 'text-emerald-400' : 'text-primary'}`}>
                  {STATUS_LABELS[selectedState.status]}
                </div>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-[15%] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-background/45 px-2.5 py-1 text-[8px] uppercase tracking-[0.18em] text-primary/75 backdrop-blur-sm">
            {rotationMode === 'manual' ? 'Vue sélectionnée' : rotationMode === 'paused' ? 'Rotation en pause' : 'Rotation automatique'}
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleToggleRotation}
            className="absolute bottom-[15%] right-[4%] z-30 flex items-center gap-1.5 rounded-full border border-primary/25 bg-background/65 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-primary shadow-lg backdrop-blur-md transition-all hover:border-primary/70 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={autoRotateRef.current ? 'Mettre la rotation en pause' : 'Reprendre la rotation automatique'}
          >
            {autoRotateRef.current ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {autoRotateRef.current ? 'Pause' : 'Reprendre'}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRotateButton}
            className="absolute bottom-[7%] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/35 bg-background/65 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-primary shadow-lg backdrop-blur-md transition-all hover:border-primary/70 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCw className="h-3 w-3" />
            Tourner le globe
          </button>
        </>
      )}
    </div>
  );
}
