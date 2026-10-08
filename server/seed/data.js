// Static seed content. All hotel names are fictional.

export const CITIES = [
  { code: 'DEL', city: 'Delhi', airport: 'Indira Gandhi International Airport', lat: 28.56, lon: 77.1, image: 'delhi.jpg' },
  { code: 'BOM', city: 'Mumbai', airport: 'Chhatrapati Shivaji Maharaj International Airport', lat: 19.09, lon: 72.87, image: 'mumbai.jpg' },
  { code: 'BLR', city: 'Bengaluru', airport: 'Kempegowda International Airport', lat: 13.2, lon: 77.71, image: 'bengaluru.jpg' },
  { code: 'HYD', city: 'Hyderabad', airport: 'Rajiv Gandhi International Airport', lat: 17.24, lon: 78.43, image: 'hyderabad.jpg' },
  { code: 'MAA', city: 'Chennai', airport: 'Chennai International Airport', lat: 12.99, lon: 80.17, image: 'chennai.jpg' },
  { code: 'CCU', city: 'Kolkata', airport: 'Netaji Subhas Chandra Bose International Airport', lat: 22.65, lon: 88.45, image: 'kolkata.jpg' },
  { code: 'PNQ', city: 'Pune', airport: 'Pune International Airport', lat: 18.58, lon: 73.92, image: 'pune.jpg' },
  { code: 'AMD', city: 'Ahmedabad', airport: 'Sardar Vallabhbhai Patel International Airport', lat: 23.07, lon: 72.63, image: 'ahmedabad.jpg' },
];

// 18 city pairs, flown in both directions = 36 routes
export const ROUTE_PAIRS = [
  ['DEL', 'BOM'], ['DEL', 'BLR'], ['DEL', 'HYD'], ['DEL', 'MAA'], ['DEL', 'CCU'], ['DEL', 'PNQ'],
  ['DEL', 'AMD'], ['BOM', 'BLR'], ['BOM', 'HYD'], ['BOM', 'MAA'], ['BOM', 'CCU'], ['BOM', 'AMD'],
  ['BLR', 'HYD'], ['BLR', 'MAA'], ['BLR', 'CCU'], ['BLR', 'PNQ'], ['HYD', 'MAA'], ['CCU', 'HYD'],
];

// aircraftConfig keys come from the platform catalogue (server/services/aircraft.js).
// IndiGo flies the ATR 72-600 on routes shorter than 600 km.
export const AIRLINES = [
  { name: 'IndiGo', code: '6E', slug: 'indigo', aircraftConfig: 'A320neo-1', shortHaulConfig: 'ATR72-600' },
  { name: 'Air India', code: 'AI', slug: 'air-india', aircraftConfig: 'A321neo-2' },
  { name: 'Vistara', code: 'UK', slug: 'vistara', aircraftConfig: 'A320neo-2' },
  { name: 'SpiceJet', code: 'SG', slug: 'spicejet', aircraftConfig: 'B737-800-1' },
];

export const MEALS = [
  { name: 'Vegetable biryani', price: 350, isVeg: true },
  { name: 'Paneer tikka sandwich', price: 280, isVeg: true },
  { name: 'Masala upma with chutney', price: 220, isVeg: true },
  { name: 'Seasonal fruit platter', price: 240, isVeg: true },
  { name: 'Chicken junglee sandwich', price: 300, isVeg: false },
  { name: 'Butter chicken with rice', price: 420, isVeg: false },
];

export const HOTEL_AMENITIES = [
  'Free Wi-Fi', 'Swimming pool', 'Spa', 'Fitness centre', 'Restaurant', 'Bar',
  'Airport shuttle', 'Parking', '24-hour room service', 'Air conditioning', 'Pet friendly', 'Business centre',
];

export const ROOM_AMENITIES = ['Air conditioning', 'Rain shower', 'Minibar', 'Work desk', 'Smart TV', 'Tea & coffee maker', 'Bathtub', 'City view', 'Balcony'];

export const HOTELS_BY_CITY = {
  Delhi: [
    ['The Lodhi Courtyard', 'Lodhi Estate, New Delhi'],
    ['Haveli Saffron', 'Chandni Chowk, Old Delhi'],
    ['Aravalli House', 'Chanakyapuri, New Delhi'],
    ['The Mehrauli Retreat', 'Mehrauli, New Delhi'],
    ['Connaught Terrace', 'Connaught Place, New Delhi'],
    ['Jor Bagh Residency', 'Jor Bagh, New Delhi'],
  ],
  Mumbai: [
    ['The Marine Palm', 'Marine Drive, Mumbai'],
    ['Colaba Blue House', 'Colaba, Mumbai'],
    ['Bandstand Villa', 'Bandra West, Mumbai'],
    ['Juhu Tide Hotel', 'Juhu, Mumbai'],
    ['Kala Ghoda Rooms', 'Fort, Mumbai'],
    ['The Worli Pier', 'Worli, Mumbai'],
  ],
  Bengaluru: [
    ['The Cubbon Leaf', 'Kasturba Road, Bengaluru'],
    ['Indiranagar Loft', 'Indiranagar, Bengaluru'],
    ['Nandi Hills Lodge', 'Devanahalli, Bengaluru'],
    ['Lavelle Garden Hotel', 'Lavelle Road, Bengaluru'],
    ['Koramangala Commons', 'Koramangala, Bengaluru'],
    ['The Ulsoor Lakehouse', 'Halasuru, Bengaluru'],
  ],
  Hyderabad: [
    ['The Pearl Nizam', 'Banjara Hills, Hyderabad'],
    ['Charminar Courtyard', 'Laad Bazaar, Hyderabad'],
    ['Hussain Sagar Suites', 'Necklace Road, Hyderabad'],
    ['Jubilee Hills House', 'Jubilee Hills, Hyderabad'],
    ['Golconda Stone Hotel', 'Golconda, Hyderabad'],
    ['Hitec Crest', 'HITEC City, Hyderabad'],
  ],
  Chennai: [
    ['The Marina Veranda', 'Marina Beach Road, Chennai'],
    ['Mylapore Temple House', 'Mylapore, Chennai'],
    ['Besant Nagar Shores', 'Besant Nagar, Chennai'],
    ['Kodambakkam Grand', 'Kodambakkam, Chennai'],
    ['The Coromandel Pavilion', 'Nungambakkam, Chennai'],
    ['ECR Sea Breeze', 'East Coast Road, Chennai'],
  ],
  Kolkata: [
    ['The Park Street Arcade', 'Park Street, Kolkata'],
    ['Hooghly Riverside', 'Strand Road, Kolkata'],
    ['Ballygunge Mansion', 'Ballygunge, Kolkata'],
    ['Victoria Garden Hotel', 'Maidan, Kolkata'],
    ['Salt Lake Commons', 'Salt Lake City, Kolkata'],
    ['College Street Rooms', 'College Street, Kolkata'],
  ],
  Pune: [
    ['The Koregaon Villa', 'Koregaon Park, Pune'],
    ['Shaniwar Wada Inn', 'Shaniwar Peth, Pune'],
    ['Sinhagad View Hotel', 'Sinhagad Road, Pune'],
    ['Deccan Garden House', 'Deccan Gymkhana, Pune'],
    ['Baner Hill Suites', 'Baner, Pune'],
    ['Kalyani Nagar Residency', 'Kalyani Nagar, Pune'],
  ],
  Ahmedabad: [
    ['Sabarmati Riverfront Hotel', 'Ashram Road, Ahmedabad'],
    ['The Pol House', 'Old City, Ahmedabad'],
    ['Law Garden Residency', 'Ellisbridge, Ahmedabad'],
    ['Adalaj Step Retreat', 'Adalaj, Ahmedabad'],
    ['SG Highway Suites', 'SG Highway, Ahmedabad'],
    ['Kankaria Lake House', 'Maninagar, Ahmedabad'],
  ],
};

export const REVIEWER_NAMES = [
  'Ananya S.', 'Rahul M.', 'Priya K.', 'Vikram R.', 'Meera J.', 'Arjun P.', 'Kavya N.', 'Siddharth T.',
  'Nisha G.', 'Rohan D.', 'Aditi B.', 'Karan V.', 'Ishita L.', 'Farhan Q.', 'Lakshmi I.', 'Devika A.',
];

export const FLIGHT_REVIEWS = {
  5: [
    'Left on time and landed early. Crew were calm and courteous throughout.',
    'Smooth boarding, clean cabin, and the seat had more legroom than I expected.',
    'Effortless trip — the meal was hot and genuinely good.',
  ],
  4: [
    'Good flight overall. Boarding was a little slow but the crew made up for it.',
    'Comfortable and punctual. Would have liked a wider meal choice.',
    'On time both ways. Seats were a bit firm but fine for a short hop.',
  ],
  3: [
    'Average experience. Delayed by about twenty minutes with little communication.',
    'Cabin was clean but cramped. Fine for the price.',
  ],
  2: ['Delayed over an hour and the gate changed twice. Staff were polite, at least.'],
};

export const HOTEL_REVIEWS = {
  5: [
    'Quiet, beautifully kept rooms and staff who remembered our names by the second morning.',
    'The breakfast alone is worth staying for. Spotless and very calm.',
    'One of the most restful stays we have had in India. Would book again without thinking.',
    'Thoughtful design, excellent bed, and a pool we had almost to ourselves.',
  ],
  4: [
    'Lovely property in a great location. Check-in took a while, but everything else was easy.',
    'Comfortable room and friendly staff. Wi-Fi was patchy in the evening.',
    'Very good value for the neighbourhood. The restaurant is excellent.',
  ],
  3: [
    'Decent stay. Room was clean but smaller than the photos suggest.',
    'Good location, though street noise carried into the room at night.',
  ],
  2: ['The room needed maintenance and housekeeping missed a day. Location was the only upside.'],
};

export const HOTEL_PHOTO_COUNT = 12;
export const ROOM_TYPES = [
  { name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, bedType: 'King bed', factor: 1 },
  { name: 'Premier Twin Room', occupancy: { adults: 2, children: 1 }, bedType: 'Two single beds', factor: 1.2 },
  { name: 'Signature Suite', occupancy: { adults: 3, children: 2 }, bedType: 'King bed + sofa bed', factor: 1.9 },
];
