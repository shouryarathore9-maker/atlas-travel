import { api } from './client.js';

export const authApi = {
  me: () => api('/auth/me'),
  login: (body) => api('/auth/login', { method: 'POST', body }),
  register: (body) => api('/auth/register', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const flightsApi = {
  search: (query, opts) => api('/flights', { query, ...opts }),
  get: (id, opts) => api(`/flights/${id}`, opts),
};

export const hotelsApi = {
  search: (query, opts) => api('/hotels', { query, ...opts }),
  get: (id, opts) => api(`/hotels/${id}`, opts),
  featured: (query, opts) => api('/hotels/featured', { query, ...opts }),
};

export const reviewsApi = {
  list: (query, opts) => api('/reviews', { query, ...opts }),
};

export const bookingsApi = {
  mine: (opts) => api('/bookings/me', opts),
  get: (key, opts) => api(`/bookings/${encodeURIComponent(key)}`, opts),
  cancel: (id) => api(`/bookings/${id}/cancel`, { method: 'PATCH' }),
};

export const paymentsApi = {
  mock: (body) => api('/payments/mock', { method: 'POST', body }),
};

const adminResource = (name) => ({
  list: (query, opts) => api(`/admin/${name}`, { query, ...opts }),
  get: (id, opts) => api(`/admin/${name}/${id}`, opts),
  create: (body) => api(`/admin/${name}`, { method: 'POST', body }),
  update: (id, body) => api(`/admin/${name}/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/admin/${name}/${id}`, { method: 'DELETE' }),
});

export const adminApi = {
  flights: adminResource('flights'),
  hotels: adminResource('hotels'),
};
