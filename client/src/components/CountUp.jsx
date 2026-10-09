import { useLayoutEffect, useRef, useState } from 'react';
import { canAnimate, observeOnce } from '../lib/motion.js';

const roundTo = (n, decimals) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
const easeOut = (t) => 1 - (1 - t) ** 3;

// A number that counts up (ease-out, ~700ms) the first time it scrolls into view, and glides from the
// old to the new value when it changes later. Re-renders with the same value do nothing.
// - `format` is the same formatter the page used before (e.g. formatPrice), so the text is identical.
// - The final value is always in the DOM and readable by screen readers; the moving number is
//   aria-hidden and drawn over the (invisible) final value, so the width never jumps.
// - Reduced motion, no IntersectionObserver (or no JS) → the final value, plain.
export default function CountUp({ value, format = String, decimals = 0, duration = 700, className = '' }) {
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
      stop = observeOnce(el, () => run(0));
    } else if (onScreen.current !== value) {
      run(onScreen.current);
    }
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  }, [value, finite, decimals, duration]);

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
