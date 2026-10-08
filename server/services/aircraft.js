// Platform aircraft catalogue (prd.md → Aircraft configurations). A configuration fixes the cabins
// and seat layout; the same configuration has the same layout for every airline (airlines only block
// seats). Layouts are simplified from real ones — the assumptions are recorded in prd.md.

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Letters left-to-right, with '' marking the aisle.
const THREE_THREE = ['A', 'B', 'C', '', 'D', 'E', 'F'];
const TWO_TWO = ['A', 'C', '', 'D', 'F'];

export const AIRCRAFT = {
  'A320neo-1': {
    key: 'A320neo-1',
    short: 'A320neo · 1-class',
    name: 'Airbus A320neo',
    label: 'Airbus A320neo · single-class (186)',
    cabins: { economy: { rows: range(1, 31), layout: THREE_THREE, extraLegroomRows: [1, 12, 13] } },
  },
  'A320neo-2': {
    key: 'A320neo-2',
    short: 'A320neo · 2-class',
    name: 'Airbus A320neo',
    label: 'Airbus A320neo · two-class (8 + 150)',
    cabins: {
      business: { rows: range(1, 2), layout: TWO_TWO, extraLegroomRows: [] },
      economy: { rows: range(3, 27), layout: THREE_THREE, extraLegroomRows: [3, 12, 13] },
    },
  },
  'A321neo-2': {
    key: 'A321neo-2',
    short: 'A321neo · 2-class',
    name: 'Airbus A321neo',
    label: 'Airbus A321neo · two-class (16 + 168)',
    cabins: {
      business: { rows: range(1, 4), layout: TWO_TWO, extraLegroomRows: [] },
      economy: { rows: range(5, 32), layout: THREE_THREE, extraLegroomRows: [5, 15, 16] },
    },
  },
  'B737-800-1': {
    key: 'B737-800-1',
    short: '737-800 · 1-class',
    name: 'Boeing 737-800',
    label: 'Boeing 737-800 · single-class (186)',
    cabins: { economy: { rows: range(1, 31), layout: THREE_THREE, extraLegroomRows: [1, 14, 15] } },
  },
  'ATR72-600': {
    key: 'ATR72-600',
    short: 'ATR 72-600',
    name: 'ATR 72-600',
    label: 'ATR 72-600 · single-class (72)',
    maxRouteKm: 600,
    cabins: { economy: { rows: range(1, 18), layout: TWO_TWO, extraLegroomRows: [] } },
  },
};

export const AIRCRAFT_KEYS = Object.keys(AIRCRAFT);

export function seatLetters(cabin) {
  return cabin.layout.filter(Boolean);
}

export function cabinCapacity(config, cabinName) {
  const cabin = AIRCRAFT[config]?.cabins[cabinName];
  return cabin ? cabin.rows.length * seatLetters(cabin).length : 0;
}

export function hasCabin(config, cabinName) {
  return Boolean(AIRCRAFT[config]?.cabins[cabinName]);
}

// Every seat label of a cabin, e.g. ["5A", "5B", ...].
export function cabinSeats(config, cabinName) {
  const cabin = AIRCRAFT[config]?.cabins[cabinName];
  if (!cabin) return [];
  const letters = seatLetters(cabin);
  return cabin.rows.flatMap((row) => letters.map((letter) => `${row}${letter}`));
}
