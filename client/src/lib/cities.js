// Mirrors the seeded cities in server/seed/data.js
export const CITIES = [
  { code: 'DEL', city: 'Delhi', image: '/images/seed/cities/delhi.jpg', blurb: 'Mughal gardens and old-city lanes' },
  { code: 'BOM', city: 'Mumbai', image: '/images/seed/cities/mumbai.jpg', blurb: 'Sea-facing promenades and art deco' },
  { code: 'BLR', city: 'Bengaluru', image: '/images/seed/cities/bengaluru.jpg', blurb: 'Garden city, easy weekends' },
  { code: 'HYD', city: 'Hyderabad', image: '/images/seed/cities/hyderabad.jpg', blurb: 'Palaces, pearls and biryani' },
  { code: 'MAA', city: 'Chennai', image: '/images/seed/cities/chennai.jpg', blurb: 'Temples and a long, slow coastline' },
  { code: 'CCU', city: 'Kolkata', image: '/images/seed/cities/kolkata.jpg', blurb: 'Colonial avenues and river light' },
  { code: 'PNQ', city: 'Pune', image: '/images/seed/cities/pune.jpg', blurb: 'Hill forts and leafy cantonments' },
  { code: 'AMD', city: 'Ahmedabad', image: '/images/seed/cities/ahmedabad.jpg', blurb: 'Stepwells and a heritage old city' },
];

export const AIRPORTS = {
  DEL: 'Indira Gandhi International Airport',
  BOM: 'Chhatrapati Shivaji Maharaj International Airport',
  BLR: 'Kempegowda International Airport',
  HYD: 'Rajiv Gandhi International Airport',
  MAA: 'Chennai International Airport',
  CCU: 'Netaji Subhas Chandra Bose International Airport',
  PNQ: 'Pune International Airport',
  AMD: 'Sardar Vallabhbhai Patel International Airport',
};

export const cityByCode = (code) => CITIES.find((c) => c.code === code);
