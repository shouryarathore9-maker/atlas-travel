// A tiny store for the top progress bar: how many API requests are in flight, plus a short
// "navigation" hold so a search shows the bar the moment it is submitted (before the results page
// has started its own request). Components subscribe with useSyncExternalStore.

let inFlight = 0;
let holdTimer = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());

export const subscribeProgress = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// 'idle' | 'busy' (requests only: shown after a short delay) | 'now' (shown immediately)
export const getProgressState = () => (holdTimer ? 'now' : inFlight > 0 ? 'busy' : 'idle');

function releaseHold() {
  if (!holdTimer) return;
  clearTimeout(holdTimer);
  holdTimer = 0;
}

// Call when a request starts; call the returned function when its response has arrived.
export function requestStarted() {
  inFlight += 1;
  releaseHold(); // the bar is already showing; the request keeps it busy from here
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inFlight -= 1;
    emit();
  };
}

// Shows the bar right away, until the next request starts (or `ms` passes with none).
// Returns a function that ends this hold early (e.g. when a lazy page has finished loading).
export function startProgressNow(ms = 1500) {
  releaseHold();
  const timer = setTimeout(() => {
    holdTimer = 0;
    emit();
  }, ms);
  holdTimer = timer;
  emit();
  return () => {
    if (holdTimer !== timer) return;
    releaseHold();
    emit();
  };
}
