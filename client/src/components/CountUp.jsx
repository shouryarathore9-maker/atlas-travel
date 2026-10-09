import { useLayoutEffect, useRef, useState } from 'react';
import { canAnimate, observeOnce } from '../lib/motion.js';

const roundTo = (n, decimals) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
// Ease-in-out sine: the number starts gently, climbs readably and settles softly.
const easeOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// A number that counts up from zero (gentle ease-in-out, ~1.8 s, after a short pause so the eye lands on it) the
// first time it is on screen, and glides from the
// old to the new value when it changes later. Re-renders with the same value do nothing.
// - `format` is the same formatter the page used before (e.g. formatPrice), so the text is identical.
// - The final value is always in the DOM and readable by screen readers; the moving number is
//   aria-hidden and drawn over the (invisible) final value, so the width never jumps.
// - No IntersectionObserver (or no JS) → the final value, plain. The device's reduce-motion setting is
//   deliberately not consulted (owner's choice, prd.md → Decisions #36).
export default function CountUp({ value, format = String, decimals = 0, duration = 1800, delay = 250, className = '' }) {
  const ref = useRef(null);
  const onScreen = useRef(null); // the number currently drawn (null until it has counted once)
  const [counting, setCounting] = useState(null); // in-between number while animating; null = final value
  const finite = Number.isFinite(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!finite || !el || !canAnimate() || (onScreen.current === null && value === 0)) {
      onScreen.current = finite ? value : null;
      setCounting(null);
      return undefined;
    }
    let frame = 0;
    let stop = () => {};
    const run = (from) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const current = from + (value - from) * easeOut(t);
        onScreen.current = current;
        if (t < 1) {
          setCounting(roundTo(current, decimals));
          frame = requestAnimationFrame(step);
        } else {
          onScreen.current = value;
          setCounting(null);
        }
      };
      frame = requestAnimationFrame(step);
    };

    if (onScreen.current === null) {
      // First appearance: hold at zero (before paint) and count once it is on screen.
      setCounting(0);
      let wait = 0;
      const cancel = observeOnce(el, () => {
        wait = window.setTimeout(() => run(0), delay);
      });
      stop = () => {
        cancel();
        window.clearTimeout(wait);
      };
    } else if (onScreen.current !== value) {
      run(onScreen.current);
    }
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  }, [value, finite, decimals, duration, delay]);

  const final = format(value);
  if (counting === null) {
    return (
      <span ref={ref} className={`count-up ${className}`.trim()}>
        {final}
      </span>
    );
  }
  return (
    <span ref={ref} className={`count-up is-counting ${className}`.trim()}>
      <span className="count-up-final">{final}</span>
      <span className="count-up-live" aria-hidden="true">
        {format(counting)}
      </span>
    </span>
  );
}
