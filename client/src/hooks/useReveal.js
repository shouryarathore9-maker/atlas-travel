import { useLayoutEffect, useRef } from 'react';
import { canAnimate, isOnScreen, observeOnce } from '../lib/motion.js';

// Fades an element in (with a short slide up) the first time it scrolls into view.
// Content that is already on screen when it mounts is left alone, nothing is hidden without
// IntersectionObserver or under reduced motion, and only opacity/transform change (no layout shift).
export function useReveal() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate() || isOnScreen(el)) return undefined;
    el.classList.add('reveal');
    let timer = 0;
    const stop = observeOnce(el, () => {
      el.classList.add('is-revealed');
      // Drop the classes once the fade is done so the element's own hover/transform styles apply again.
      timer = window.setTimeout(() => el.classList.remove('reveal', 'is-revealed'), 600);
    }, '0px 0px -40px 0px');
    return () => {
      stop();
      window.clearTimeout(timer);
      el.classList.remove('reveal', 'is-revealed');
    };
  }, []);
  return ref;
}
