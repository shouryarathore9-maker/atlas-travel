// Static geography for the illustrated route map (no map APIs). Coordinates are [lon, lat].

export const AIRPORT_COORDS = {
  DEL: [77.1, 28.56],
  BOM: [72.87, 19.09],
  BLR: [77.71, 13.2],
  HYD: [78.43, 17.24],
  MAA: [80.17, 12.99],
  CCU: [88.45, 22.65],
  PNQ: [73.92, 18.58],
  AMD: [72.63, 23.07],
};

// Smaller reference cities, labelled only when they fall inside the map view.
export const REFERENCE_CITIES = [
  ['Jaipur', 75.79, 26.91],
  ['Lucknow', 80.95, 26.85],
  ['Nagpur', 79.09, 21.15],
  ['Surat', 72.83, 21.17],
  ['Bhopal', 77.41, 23.26],
  ['Indore', 75.86, 22.72],
  ['Goa', 73.83, 15.49],
  ['Kochi', 76.27, 9.93],
  ['Visakhapatnam', 83.22, 17.69],
  ['Bhubaneswar', 85.82, 20.3],
  ['Patna', 85.14, 25.59],
  ['Varanasi', 82.97, 25.32],
  ['Chandigarh', 76.78, 30.73],
  ['Mangaluru', 74.86, 12.91],
  ['Coimbatore', 76.96, 11.02],
  ['Raipur', 81.63, 21.25],
  ['Udaipur', 73.71, 24.58],
  ['Vijayawada', 80.65, 16.51],
  ['Ranchi', 85.31, 23.34],
];

export const REGION_LABELS = [
  { text: 'Arabian Sea', lon: 67.8, lat: 16.5, kind: 'sea' },
  { text: 'Bay of Bengal', lon: 88.2, lat: 16.2, kind: 'sea' },
  { text: 'RAJASTHAN', lon: 72.6, lat: 27.1, kind: 'state' },
  { text: 'GUJARAT', lon: 71.4, lat: 22.9, kind: 'state' },
  { text: 'MAHARASHTRA', lon: 76.0, lat: 19.6, kind: 'state' },
  { text: 'KARNATAKA', lon: 75.9, lat: 14.9, kind: 'state' },
  { text: 'TAMIL NADU', lon: 78.3, lat: 11.0, kind: 'state' },
  { text: 'KERALA', lon: 76.2, lat: 10.2, kind: 'state' },
  { text: 'TELANGANA', lon: 79.1, lat: 17.9, kind: 'state' },
  { text: 'ANDHRA PRADESH', lon: 79.6, lat: 15.4, kind: 'state' },
  { text: 'MADHYA PRADESH', lon: 78.3, lat: 23.6, kind: 'state' },
  { text: 'UTTAR PRADESH', lon: 80.6, lat: 27.3, kind: 'state' },
  { text: 'ODISHA', lon: 84.3, lat: 20.6, kind: 'state' },
  { text: 'WEST BENGAL', lon: 87.9, lat: 23.9, kind: 'state' },
  { text: 'BIHAR', lon: 85.8, lat: 25.9, kind: 'state' },
  { text: 'CHHATTISGARH', lon: 82.0, lat: 21.6, kind: 'state' },
  { text: 'PAKISTAN', lon: 68.2, lat: 27.8, kind: 'country' },
  { text: 'NEPAL', lon: 84.0, lat: 28.4, kind: 'country' },
  { text: 'BANGLADESH', lon: 90.3, lat: 24.0, kind: 'country' },
  { text: 'SRI LANKA', lon: 80.7, lat: 7.6, kind: 'country' },
];

// Simplified outline of India (hand-traced, ~60 points — illustrative, not survey-accurate).
export const INDIA_OUTLINE = [
  [68.2, 23.6], [68.9, 22.4], [69.9, 21.2], [70.9, 20.7], [72.2, 21.2], [72.6, 21.6], [72.9, 20.6], [72.8, 19.3],
  [72.9, 18.6], [73.2, 17.2], [73.6, 16.0], [73.9, 15.1], [74.4, 14.0], [74.8, 12.8], [75.3, 11.8], [75.9, 10.9],
  [76.3, 9.6], [76.8, 8.6], [77.5, 8.1], [78.1, 8.8], [78.9, 9.3], [79.3, 10.3], [79.8, 10.9], [79.9, 12.1],
  [80.3, 13.4], [80.1, 15.2], [80.8, 15.9], [81.6, 16.4], [82.3, 16.8], [83.3, 17.6], [84.2, 18.4], [85.1, 19.3],
  [86.2, 19.9], [86.9, 20.8], [87.4, 21.6], [88.2, 21.6], [89.0, 21.8], [88.8, 22.9], [88.9, 24.1], [88.1, 24.6],
  [88.5, 25.5], [88.1, 26.3], [89.1, 26.6], [90.7, 26.8], [92.1, 26.9], [93.7, 27.4], [95.3, 28.2], [96.7, 28.3],
  [97.3, 27.8], [96.2, 27.1], [95.2, 26.1], [94.6, 25.1], [94.2, 23.9], [93.3, 22.9], [92.6, 22.0], [92.3, 23.4],
  [91.7, 24.1], [91.1, 25.2], [89.9, 25.3], [89.8, 26.0], [88.9, 26.2], [88.4, 26.9], [88.8, 27.9], [88.1, 27.6],
  [86.5, 27.4], [84.7, 27.4], [83.3, 27.4], [81.9, 27.9], [80.6, 28.7], [80.2, 30.1], [78.9, 31.1], [78.7, 32.3],
  [79.4, 32.9], [79.5, 34.3], [78.2, 35.4], [76.8, 35.6], [75.4, 35.1], [74.2, 34.6], [73.9, 33.8], [74.4, 32.9],
  [75.1, 32.3], [74.6, 31.2], [74.0, 30.4], [73.3, 29.6], [72.4, 28.4], [71.0, 27.9], [70.1, 27.7], [69.5, 26.9],
  [70.2, 26.1], [70.9, 25.4], [71.1, 24.6], [69.9, 24.3], [68.9, 24.3],
];

// Land around India (Pakistan / Nepal / Bangladesh / Myanmar), extended off-view so only the coast shows.
export const SUBCONTINENT_OUTLINE = [
  [68.2, 23.6], [67.3, 24.6], [66.6, 25.4], [64.5, 25.3], [61.6, 25.2], [55, 25.5], [55, 42], [104, 42], [104, 15],
  [98.5, 15.5], [97.6, 16.6], [94.6, 16.2], [94.2, 18.6], [93.0, 20.0], [92.3, 20.8], [91.8, 22.3], [90.6, 22.2],
  [89.9, 21.9], [89.0, 21.8], [88.2, 21.6], ...INDIA_OUTLINE.slice(0, 35).reverse(),
];

export const SRI_LANKA_OUTLINE = [
  [79.9, 9.8], [80.3, 9.8], [80.9, 8.9], [81.4, 8.1], [81.9, 7.4], [81.8, 6.6], [81.2, 6.1], [80.5, 5.9],
  [80.0, 6.4], [79.8, 7.4], [79.8, 8.6],
];
