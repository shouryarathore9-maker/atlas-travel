// Shared helpers for the small motion effects (scroll reveals, count-up numbers). Every effect is
// progressive enhancement: without IntersectionObserver, content shows as-is.

// The owner chose motion for everyone: the device's "reduce motion" setting is deliberately not
// consulted (prd.md → Decisions #36).
export const canAnimate = () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function' && typeof window.requestAnimationFrame === 'function';

// One observer per root margin for the whole page; each element's callback runs once, the first
// time it is on screen. Reveals use a small negative bottom margin (they start just inside the
// viewport); count-ups use none, so a number in a fixed bottom bar still counts.
const observers = new Map();

function observerFor(rootMargin) {
  if (!observers.has(rootMargin)) {
    const callbacks = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const fn = callbacks.get(entry.target);
          callbacks.delete(entry.target);
          io.unobserve(entry.target);
          fn?.();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    observers.set(rootMargin, { io, callbacks });
  }
  return observers.get(rootMargin);
}

export function observeOnce(el, onVisible, rootMargin = '0px') {
  const { io, callbacks } = observerFor(rootMargin);
  callbacks.set(el, onVisible);
  io.observe(el);
  return () => {
    if (callbacks.delete(el)) io.unobserve(el);
  };
}

