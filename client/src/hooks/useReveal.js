import { useLayoutEffect, useRef } from 'react';
import { canAnimate, observeOnce } from '../lib/motion.js';

// Elements that come into view together (e.g. a page of result cards on arrival) reveal one after
// another: each gets a slightly longer delay, up to a cap, and the count resets after a quiet moment.
let batchIndex = 0;
let batchTimer = 0;
function nextDelay() {
  const delay = Math.min(batchIndex, 6) * 120;
  batchIndex += 1;
  window.clearTimeout(batchTimer);
  batchTimer = window.setTimeout(() => {
    batchIndex = 0;
  }, 120);
  return delay;
}

// Fades an element in with a slide up the first time it is on screen — including on arrival, so the
// first screen animates too. Nothing is hidden without IntersectionObserver, and only opacity and
// transform change (no layout shift).
export function useReveal() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return undefined;
    el.classList.add('reveal');
    let timer = 0;
    let frame = 0;
    const stop = observeOnce(
      el,
      () => {
        el.style.setProperty('--reveal-delay', `${nextDelay()}ms`);
        // Two frames, so the hidden state has been painted before the transition starts.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => el.classList.add('is-revealed'));
        });
        // Drop the classes once done so the element's own hover/transform styles apply again.
        timer = window.setTimeout(() => {
          el.classList.remove('reveal', 'is-revealed');
          el.style.removeProperty('--reveal-delay');
        }, 1900);
      },
      '0px 0px -40px 0px',
    );
    return () => {
      stop();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      el.classList.remove('reveal', 'is-revealed');
    };
  }, []);
  return ref;
}
