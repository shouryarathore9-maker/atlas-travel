// Festival and holiday periods used by default rate-card seasons and the festive offers.
// Dates checked against the Government of India holiday lists (DoPT): 2026 — Dussehra 20 Oct,
// Diwali 8 Nov; 2027 — Makar Sankranti 14 Jan, Pongal 15 Jan, Holika Dahan 22 Mar, Holi 23 Mar,
// Navratri ends with Mahanavami 8 Oct and Dussehra 9 Oct, Naraka Chaturdasi 28 Oct, Diwali 29 Oct,
// Bhai Duj 31 Oct. Ranges add the travel days around each festival.
export const FESTIVALS = [
  { key: 'navratri-2026', name: 'Navratri & Dussehra', from: '2026-10-11', to: '2026-10-21' },
  { key: 'diwali-2026', name: 'Diwali', from: '2026-11-05', to: '2026-11-11' },
  { key: 'yearend-2026', name: 'Christmas & New Year', from: '2026-12-20', to: '2027-01-03' },
  { key: 'sankranti-2027', name: 'Makar Sankranti & Pongal', from: '2027-01-13', to: '2027-01-17' },
  { key: 'holi-2027', name: 'Holi', from: '2027-03-21', to: '2027-03-24' },
  { key: 'navratri-2027', name: 'Navratri & Dussehra', from: '2027-09-30', to: '2027-10-10' },
  { key: 'diwali-2027', name: 'Diwali', from: '2027-10-26', to: '2027-11-01' },
  { key: 'yearend-2027', name: 'Christmas & New Year', from: '2027-12-20', to: '2028-01-03' },
];

// The monsoon lull for city hotels (off-season), per year.
export const OFF_SEASONS = [
  { key: 'monsoon-2027', name: 'Monsoon off-season', from: '2027-07-01', to: '2027-08-31' },
];
