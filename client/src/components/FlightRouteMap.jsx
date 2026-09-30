import { useId, useMemo } from 'react';
import {
  AIRPORT_COORDS,
  INDIA_OUTLINE,
  REFERENCE_CITIES,
  REGION_LABELS,
  SRI_LANKA_OUTLINE,
  SUBCONTINENT_OUTLINE,
} from '../lib/geo.js';

// Illustrated, "origami" style route map: folded-paper land facets, a patterned sea, a curved
// route line, airport markers and city labels. Pure SVG — no map tiles or external APIs.

const W = 440;
const H = 300;

// Deterministic pseudo-random so the paper folds look the same on every render.
function rand(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function makeProjection(a, b) {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const k = Math.cos(lat0);
  const px = ([lon, lat]) => [lon * k, -lat];
  const [ax, ay] = px(a);
  const [bx, by] = px(b);
  // Pad the route generously and never zoom in closer than ~7° so short hops keep context.
  const spanX = Math.max(Math.abs(ax - bx) * 1.9, 7 * k);
  const spanY = Math.max(Math.abs(ay - by) * 1.9, 5);
  const scale = Math.min(W / spanX, H / spanY);
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  return (coord) => {
    const [x, y] = px(coord);
    return [W / 2 + (x - cx) * scale, H / 2 + (y - cy) * scale];
  };
}

const toPath = (points, project) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((n) => n.toFixed(1)).join(',')}`).join('') + 'Z';

// A jittered triangle grid over the whole view; each triangle is one paper "facet".
function facets(palette, seedOffset) {
  const step = 48;
  const cols = Math.ceil(W / step) + 1;
  const rows = Math.ceil(H / step) + 1;
  const pt = (c, r) => [
    c * step + (rand(c * 31 + r * 17 + seedOffset) - 0.5) * step * 0.55,
    r * step + (rand(c * 13 + r * 29 + seedOffset) - 0.5) * step * 0.55,
  ];
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = pt(c, r);
      const b = pt(c + 1, r);
      const d = pt(c, r + 1);
      const e = pt(c + 1, r + 1);
      const flip = rand(c * 7 + r * 11 + seedOffset) > 0.5;
      const tris = flip ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
      tris.forEach((t, i) => {
        const shade = palette[Math.floor(rand(c * 101 + r * 57 + i * 7 + seedOffset) * palette.length)];
        out.push({ d: `M${t.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}Z`, fill: shade });
      });
    }
  }
  return out;
}

const LAND = ['#c9d3a6', '#bccb96', '#d4dbb3', '#b2c28b', '#c3cf9e', '#dde0bb'];
const NEIGHBOUR = ['#e6dcc4', '#ded2b6', '#ebe3cf', '#d9ccad'];
const SEA = ['#9fc3cf', '#a9cbd6', '#94bac8', '#b3d2db'];

const inView = ([x, y], margin = 12) => x > margin && x < W - margin && y > margin && y < H - margin;

export default function FlightRouteMap({ origin, destination }) {
  const uid = useId().replace(/:/g, '');
  const a = AIRPORT_COORDS[origin.code];
  const b = AIRPORT_COORDS[destination.code];

  const scene = useMemo(() => {
    if (!a || !b) return null;
    const project = makeProjection(a, b);
    const A = project(a);
    const B = project(b);

    // Curved route: quadratic Bézier bowed to one side, like an airline route map.
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(60, len * 0.2);
    const C = [(A[0] + B[0]) / 2 - (dy / len) * bow, (A[1] + B[1]) / 2 + (dx / len) * bow];
    const mid = [0.25 * A[0] + 0.5 * C[0] + 0.25 * B[0], 0.25 * A[1] + 0.5 * C[1] + 0.25 * B[1]];
    const tangent = Math.atan2(B[1] - A[1], B[0] - A[0]) * (180 / Math.PI);

    // Keep smaller labels clear of the airports, the plane, and the map edges (never clipped).
    const clearOf = ([x, y], halfW, radius) =>
      [A, B, mid].every((p) => Math.abs(p[0] - x) > halfW + 18 || Math.abs(p[1] - y) > radius);
    const fits = ([x, y], left, right) => x - left > 6 && x + right < W - 6 && y > 14 && y < H - 8;
    const approxWidth = (text, size, spacing = 0) => text.length * (size * 0.58 + spacing);

    // Put each endpoint label on the side facing away from the other endpoint.
    const labelSide = (P, Q) => (P[0] >= Q[0] ? 'start' : 'end');
    const sideA = labelSide(A, B);
    const sideB = labelSide(B, A);

    // Text boxes of the two airport labels; smaller labels must not overlap them.
    const airportBox = (P, side, name) => {
      const w = approxWidth(name, 13) + 16;
      return side === 'start' ? [P[0] + 8, P[1] - 20, P[0] + 8 + w, P[1] + 18] : [P[0] - 8 - w, P[1] - 20, P[0] - 8, P[1] + 18];
    };
    const boxes = [airportBox(A, sideA, origin.city), airportBox([B[0], B[1] - 6], sideB, destination.city)];
    const hitsBox = (x1, y1, x2, y2) => boxes.some(([bx1, by1, bx2, by2]) => x1 < bx2 && x2 > bx1 && y1 < by2 && y2 > by1);

    const refs = REFERENCE_CITIES.map(([name, lon, lat]) => ({ name, p: project([lon, lat]) }))
      .filter((c) => {
        const w = approxWidth(c.name, 9.5) + 8;
        return fits(c.p, 4, w) && clearOf(c.p, w / 2, 22) && !hitsBox(c.p[0] - 4, c.p[1] - 8, c.p[0] + w, c.p[1] + 6);
      })
      .slice(0, 7);
    const regions = REGION_LABELS.map((r) => {
      const size = r.kind === 'sea' ? 13 : r.kind === 'country' ? 10 : 8.5;
      return { ...r, p: project([r.lon, r.lat]), half: approxWidth(r.text, size, r.kind === 'sea' ? 0 : 1.4) / 2 };
    }).filter((r) => fits(r.p, r.half, r.half) && clearOf(r.p, r.half, 26) && !hitsBox(r.p[0] - r.half, r.p[1] - 10, r.p[0] + r.half, r.p[1] + 4));

    return {
      india: toPath(INDIA_OUTLINE, project),
      land: toPath(SUBCONTINENT_OUTLINE, project),
      lanka: toPath(SRI_LANKA_OUTLINE, project),
      route: `M${A.join(',')} Q${C.join(',')} ${B.join(',')}`,
      A,
      B,
      mid,
      tangent,
      refs,
      regions,
      sideA,
      sideB,
    };
  }, [a, b, origin.city, destination.city]);

  const seaFacets = useMemo(() => facets(SEA, 3), []);
  const neighbourFacets = useMemo(() => facets(NEIGHBOUR, 7), []);
  const landFacets = useMemo(() => facets(LAND, 11), []);

  if (!scene) return null;
  const { A, B } = scene;
  const label = (P, side, city, code) => {
    const x = P[0] + (side === 'start' ? 14 : -14);
    return (
      <g className="map-label map-label--airport" textAnchor={side}>
        <text x={x} y={P[1] - 2}>
          {city}
        </text>
        <text x={x} y={P[1] + 11} className="map-code">
          {code}
        </text>
      </g>
    );
  };

  return (
    <figure className="route-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Illustrated map of the route from ${origin.city} (${origin.code}) to ${destination.city} (${destination.code})`}>
        <defs>
          <clipPath id={`land-${uid}`}>
            <path d={scene.land} />
            <path d={scene.lanka} />
          </clipPath>
          <clipPath id={`india-${uid}`}>
            <path d={scene.india} />
          </clipPath>
          <pattern id={`waves-${uid}`} width="22" height="11" patternUnits="userSpaceOnUse">
            <path d="M0 11a11 11 0 0 1 22 0M5 11a6 6 0 0 1 12 0" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1" />
          </pattern>
          <filter id={`lift-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#17221F" floodOpacity="0.22" />
          </filter>
        </defs>

        <g aria-hidden="true">
          {/* Sea: blue paper facets + a wave pattern */}
          {seaFacets.map((f, i) => (
            <path key={i} d={f.d} fill={f.fill} />
          ))}
          <rect width={W} height={H} fill={`url(#waves-${uid})`} />

          {/* Neighbouring land, then India lifted slightly like a folded sheet */}
          <g clipPath={`url(#land-${uid})`} filter={`url(#lift-${uid})`}>
            {neighbourFacets.map((f, i) => (
              <path key={i} d={f.d} fill={f.fill} stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6" />
            ))}
          </g>
          <g filter={`url(#lift-${uid})`}>
            <g clipPath={`url(#india-${uid})`}>
              {landFacets.map((f, i) => (
                <path key={i} d={f.d} fill={f.fill} stroke="#fff" strokeOpacity="0.4" strokeWidth="0.6" />
              ))}
            </g>
          </g>
          <path d={scene.india} fill="none" stroke="#8a9a6c" strokeOpacity="0.55" strokeWidth="0.8" />

          {scene.regions.map((r) => (
            <text key={r.text} x={r.p[0]} y={r.p[1]} className={`map-region map-region--${r.kind}`} textAnchor="middle">
              {r.text}
            </text>
          ))}

          {scene.refs.map((c) => (
            <g key={c.name} className="map-label map-label--ref">
              <circle cx={c.p[0]} cy={c.p[1]} r="2.6" fill="#fff" stroke="#6e7560" strokeWidth="1.2" />
              <text x={c.p[0] + 6} y={c.p[1] + 3.5}>
                {c.name}
              </text>
            </g>
          ))}

          {/* Route: white casing under a deep-blue line, plane at the midpoint */}
          <path d={scene.route} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeOpacity="0.9" />
          <path d={scene.route} fill="none" stroke="#2f5d8a" strokeWidth="3.5" strokeLinecap="round" />
          <g transform={`translate(${scene.mid[0]},${scene.mid[1]}) rotate(${scene.tangent})`}>
            <circle r="11.5" fill="#fff" stroke="#2f5d8a" strokeWidth="1.5" />
            {/* Plane silhouette pointing along the route (nose at +x) */}
            <path
              d="M7.5 0c0-.9-.8-1.2-1.6-1.2H2.4L-1.6-7.2h-1.8l2.1 6H-4.6l-1.6-2.1h-1.3l.9 3.3-.9 3.3h1.3l1.6-2.1h4.3l-2.1 6h1.8l4-6h3.5c.8 0 1.6-.3 1.6-1.2z"
              fill="#2f5d8a"
            />
          </g>

          {/* Origin: ringed dot. Destination: terracotta pin. */}
          <circle cx={A[0]} cy={A[1]} r="7" fill="#fff" stroke="#17221f" strokeWidth="3" />
          <g transform={`translate(${B[0]},${B[1]})`}>
            <path d="M0 0c-2-6-9-10-9-17a9 9 0 0 1 18 0c0 7-7 11-9 17z" fill="#b86b4b" stroke="#8f4b2c" strokeWidth="1" />
            <circle cy="-17" r="3.4" fill="#fff" />
          </g>

          {label(A, scene.sideA, origin.city, origin.code)}
          {label([B[0], B[1] - 6], scene.sideB, destination.city, destination.code)}
        </g>
      </svg>
    </figure>
  );
}
