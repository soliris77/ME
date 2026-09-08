import React, { useEffect, useRef, useState } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110m from 'world-atlas/land-110m.json';

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
    let rot = 0;
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
        rot = -(offset / 60) * 15;
      } else {
        rot += (dt / 1000) * 3; // 120s revolution
      }
      
      rot = rot % 360;

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

  const getDotClass = (status: ExStatus) => {
    switch(status) {
      case 'open': return 'bg-primary shadow-[0_0_10px_1px_hsl(var(--primary))] motion-safe:animate-pulse';
      case 'pre':
      case 'post': return 'bg-primary/40';
      case 'closed':
      case 'holiday': return 'bg-muted-foreground/40';
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full h-full mx-auto ${variant === 'hero' ? 'max-w-[700px] aspect-square' : 'w-full aspect-square max-h-full'}`}>
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
    </div>
  );
}
