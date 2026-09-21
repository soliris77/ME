import { useEffect, useRef } from "react";

type CursorPosition = {
  x: number;
  y: number;
};

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "select",
  "input",
  "textarea",
  "[role='button']",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
  "[data-cursor='interactive']",
  ".cursor-pointer",
].join(", ");

const TEXT_SELECTOR =
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']), textarea, [contenteditable='true']";

const CARD_SELECTOR =
  "[data-cursor-card], .market-card, .lux-card";

function getElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function getCursorContext(target: EventTarget | null) {
  const element = getElement(target);
  const textField = element?.closest(TEXT_SELECTOR);
  const interactive = element?.closest(INTERACTIVE_SELECTOR);
  const observatory = element?.closest(
    ".globe-vitality, [data-cursor-zone='observatory']",
  );
  const card = element?.closest(CARD_SELECTOR) as HTMLElement | null;
  const tone = element?.closest<HTMLElement>("[data-cursor-tone]")?.dataset
    .cursorTone;

  return {
    isTextField: Boolean(textField),
    isInteractive: Boolean(interactive),
    isObservatory: Boolean(observatory),
    card,
    tone: tone === "positive" || tone === "negative" ? tone : "gold",
  };
}

/**
 * A deliberately DOM-driven cursor: pointer movement never schedules a React
 * render. The dot is placed on the latest pointer position and the ring is
 * interpolated in one short-lived rAF loop.
 */
export default function CustomCursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef<CursorPosition>({ x: -100, y: -100 });
  const ringPositionRef = useRef<CursorPosition>({ x: -100, y: -100 });
  const animationFrameRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const activeCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    const halo = haloRef.current;
    if (!root || !dot || !ring || !halo) return;

    const finePointer = window.matchMedia("(pointer: fine) and (hover: hover)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = reducedMotion.matches;

    if (!finePointer.matches) return;

    const setPosition = (element: HTMLElement, position: CursorPosition) => {
      element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
    };

    const stopAnimationFrame = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const animate = () => {
      animationFrameRef.current = null;
      if (!visibleRef.current) return;

      const target = targetRef.current;
      const ringPosition = ringPositionRef.current;
      const reduced = reducedMotionRef.current;

      setPosition(dot, target);

      if (reduced) {
        ringPosition.x = target.x;
        ringPosition.y = target.y;
      } else {
        ringPosition.x += (target.x - ringPosition.x) * 0.18;
        ringPosition.y += (target.y - ringPosition.y) * 0.18;
      }
      setPosition(ring, ringPosition);
      setPosition(halo, ringPosition);

      const distance = Math.hypot(
        target.x - ringPosition.x,
        target.y - ringPosition.y,
      );
      if (distance > 0.08) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      }
    };

    const wakeAnimation = () => {
      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      }
    };

    const updateCardLight = (card: HTMLElement | null, event: PointerEvent) => {
      if (activeCardRef.current && activeCardRef.current !== card) {
        activeCardRef.current.classList.remove("soliris-cursor-card-active");
      }
      activeCardRef.current = card;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      card.style.setProperty("--cursor-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--cursor-y", `${event.clientY - rect.top}px`);
      card.classList.add("soliris-cursor-card-active");
    };

    const updateContext = (target: EventTarget | null, event?: PointerEvent) => {
      const context = getCursorContext(target);
      root.classList.toggle("soliris-cursor-interactive", context.isInteractive);
      root.classList.toggle("soliris-cursor-observatory", context.isObservatory);
      root.classList.toggle("soliris-cursor-native", context.isTextField);
      root.classList.toggle("soliris-cursor-positive", context.tone === "positive");
      root.classList.toggle("soliris-cursor-negative", context.tone === "negative");
      if (event) updateCardLight(context.card, event);
      return context;
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetRef.current = { x: event.clientX, y: event.clientY };
      visibleRef.current = true;
      root.classList.add("soliris-cursor-visible");
      updateContext(event.target, event);
      wakeAnimation();
    };

    const handlePointerOver = (event: PointerEvent) => {
      updateContext(event.target, event);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      visibleRef.current = false;
      root.classList.remove("soliris-cursor-visible");
      if (activeCardRef.current) {
        activeCardRef.current.classList.remove("soliris-cursor-card-active");
        activeCardRef.current = null;
      }
      stopAnimationFrame();
    };

    const handlePointerDown = (event: PointerEvent) => {
      root.classList.add("soliris-cursor-clicking");
      const context = updateContext(event.target, event);
      if (context.isObservatory) root.classList.add("soliris-cursor-dragging");
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
      clickTimerRef.current = window.setTimeout(() => {
        root.classList.remove("soliris-cursor-clicking");
        clickTimerRef.current = null;
      }, 210);
    };

    const handlePointerUp = () => {
      root.classList.remove("soliris-cursor-dragging");
    };

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (event.matches) {
        root.classList.add("soliris-cursor-reduced");
      } else {
        root.classList.remove("soliris-cursor-reduced");
      }
      wakeAnimation();
    };

    document.documentElement.classList.add("soliris-cursor-enabled");
    if (reducedMotion.matches) root.classList.add("soliris-cursor-reduced");

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerover", handlePointerOver, { passive: true });
    window.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    reducedMotion.addEventListener("change", handleReducedMotionChange);

    return () => {
      stopAnimationFrame();
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
      document.documentElement.classList.remove("soliris-cursor-enabled");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerover", handlePointerOver);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
      if (activeCardRef.current) {
        activeCardRef.current.classList.remove("soliris-cursor-card-active");
      }
    };
  }, []);

  return (
    <div ref={rootRef} className="soliris-cursor" aria-hidden="true">
      <span ref={haloRef} className="soliris-cursor-halo" />
      <span ref={ringRef} className="soliris-cursor-ring">
        <span className="soliris-cursor-reticle" />
      </span>
      <span ref={dotRef} className="soliris-cursor-core" />
    </div>
  );
}