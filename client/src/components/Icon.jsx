// Simple line icons, consistent 1.6 stroke (design.md: no filled glyphs).
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  guest: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></>,
  location: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  plane: <><path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4.5c1-1 2.6-1.3 3.2-.7.6.6.3 2.2-.7 3.2l-4.5 4 1 8L14 22l-2.5-7.5" /></>,
  bed: <><path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" /><circle cx="7" cy="11" r="1.8" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  swap: <><path d="M7 7h12l-3-3M17 17H5l3 3" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
  suitcase: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 12h16" /></>,
  meal: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3" /></>,
  seat: <><path d="M7 4v9a2 2 0 0 0 2 2h7M7 15l-1 6M17 15l1 6M16 15V11" /></>,
  star: <><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" /></>,
};

export default function Icon({ name, size = 20, title, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
