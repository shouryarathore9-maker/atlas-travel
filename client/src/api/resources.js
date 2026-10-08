import { api, uploadBlob } from './client.js';

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

export const notificationsApi = {
  list: (opts) => api('/notifications', opts),
  unread: (opts) => api('/notifications/unread-count', opts),
  read: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => api('/notifications/read-all', { method: 'POST' }),
};

export const supplierApi = {
  overview: (opts) => api('/supplier/overview', opts),
  catalogue: (opts) => api('/supplier/catalogue', opts),
  services: {
    list: (query, opts) => api('/supplier/services', { query, ...opts }),
    get: (id, opts) => api(`/supplier/services/${id}`, opts),
    create: (body) => api('/supplier/services', { method: 'POST', body }),
    update: (id, body) => api(`/supplier/services/${id}`, { method: 'PUT', body }),
    remove: (id) => api(`/supplier/services/${id}`, { method: 'DELETE' }),
  },
  departures: {
    list: (query, opts) => api('/supplier/departures', { query, ...opts }),
    stopSales: (id) => api(`/supplier/departures/${id}/stop-sales`, { method: 'POST' }),
    resumeSales: (id) => api(`/supplier/departures/${id}/resume-sales`, { method: 'POST' }),
  },
  hotel: {
    get: (opts) => api('/supplier/hotel', opts),
    update: (body) => api('/supplier/hotel', { method: 'PUT', body }),
    uploads: (opts) => api('/supplier/hotel/photos', opts),
    upload: (blob) => uploadBlob('/supplier/hotel/photos', blob),
    removeUpload: (id) => api(`/supplier/hotel/photos/${id}`, { method: 'DELETE' }),
  },
};

export const adminApi = {
  audit: (query, opts) => api('/admin/audit', { query, ...opts }),
  suppliers: (opts) => api('/admin/suppliers', opts),
};
