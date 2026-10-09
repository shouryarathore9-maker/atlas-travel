import { useEffect, useState, useSyncExternalStore } from 'react';
import { getProgressState, subscribeProgress } from '../lib/progress.js';

const SHOW_AFTER_MS = 150; // fast calls finish before the bar would appear, so it never flashes
const FADE_MS = 400;

// Slim terracotta bar across the top of the window while any API request is in flight
// (fed by api/client.js). Decorative: pages still show their own skeletons, spinners and busy buttons.
export default function ProgressBar() {
  const state = useSyncExternalStore(subscribeProgress, getProgressState, () => 'idle');
  const busy = state !== 'idle';
  const [shown, setShown] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!busy) return undefined;
    setFinishing(false);
    if (state === 'now') {
      setShown(true);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy, state]);

  useEffect(() => {
    if (busy || !shown) return undefined;
    setFinishing(true);
    const timer = setTimeout(() => {
      setShown(false);
      setFinishing(false);
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [busy, shown]);

  if (!shown) return null;
  return (
    <div className={`top-progress ${finishing ? 'is-done' : ''}`} aria-hidden="true">
      <span className="top-progress-bar" />
    </div>
  );
}
