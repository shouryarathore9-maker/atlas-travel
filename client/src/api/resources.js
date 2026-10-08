import { api, uploadBlob } from './client.js';

export const authApi = {
  me: () => api('/auth/me'),
  login: (body) => api('/auth/login', { method: 'POST', body }),
  register: (body) => api('/auth/register', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const flightsApi = {
  search: (query, opts) => api('/flights', { query, ...opts }),
  get: (id, query, opts) => api(`/flights/${id}`, { query, ...opts }),
};

export const hotelsApi = {
  search: (query, opts) => api('/hotels', { query, ...opts }),
  get: (id, query, opts) => api(`/hotels/${id}`, { query, ...opts }),
  featured: (query, opts) => api('/hotels/featured', { query, ...opts }),
};

export const reviewsApi = {
  list: (query, opts) => api('/reviews', { query, ...opts }),
};

export const offersApi = {
  list: (query, opts) => api('/offers', { query, ...opts }),
  get: (slug, opts) => api(`/offers/${encodeURIComponent(slug)}`, opts),
};

export const bookingsApi = {
  mine: (opts) => api('/bookings/me', opts),
  get: (key, opts) => api(`/bookings/${encodeURIComponent(key)}`, opts),
  cancel: (id) => api(`/bookings/${id}/cancel`, { method: 'PATCH' }),
  documents: (ref, opts) => api(`/bookings/${encodeURIComponent(ref)}/documents`, opts),
  checkIn: (ref) => api(`/bookings/${encodeURIComponent(ref)}/check-in`, { method: 'POST' }),
  respondToReschedule: (ref, decision) => api(`/bookings/${encodeURIComponent(ref)}/reschedule-response`, { method: 'POST', body: { decision } }),
};

export const paymentsApi = {
  quote: (body, opts) => api('/payments/quote', { method: 'POST', body, ...opts }),
  mock: (body) => api('/payments/mock', { method: 'POST', body }),
};

export const meApi = {
  travellers: (opts) => api('/me/travellers', opts),
  addTraveller: (body) => api('/me/travellers', { method: 'POST', body }),
  updateTraveller: (id, body) => api(`/me/travellers/${id}`, { method: 'PUT', body }),
  removeTraveller: (id) => api(`/me/travellers/${id}`, { method: 'DELETE' }),
  tickets: (opts) => api('/me/tickets', opts),
  ticket: (id, opts) => api(`/me/tickets/${id}`, opts),
  openTicket: (body) => api('/me/tickets', { method: 'POST', body }),
  replyTicket: (id, message) => api(`/me/tickets/${id}/messages`, { method: 'POST', body: { message } }),
};

export const notificationsApi = {
  list: (opts) => api('/notifications', opts),
  unread: (opts) => api('/notifications/unread-count', opts),
  read: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => api('/notifications/read-all', { method: 'POST' }),
};

const offerAdmin = (base) => ({
  list: (query, opts) => api(`${base}/offers`, { query, ...opts }),
  get: (id, opts) => api(`${base}/offers/${id}`, opts),
  create: (body) => api(`${base}/offers`, { method: 'POST', body }),
  update: (id, body) => api(`${base}/offers/${id}`, { method: 'PUT', body }),
  pause: (id) => api(`${base}/offers/${id}/pause`, { method: 'POST' }),
  resume: (id) => api(`${base}/offers/${id}/resume`, { method: 'POST' }),
});

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
    get: (id, opts) => api(`/supplier/departures/${id}`, opts),
    stopSales: (id) => api(`/supplier/departures/${id}/stop-sales`, { method: 'POST' }),
    resumeSales: (id) => api(`/supplier/departures/${id}/resume-sales`, { method: 'POST' }),
    cancel: (id, reason) => api(`/supplier/departures/${id}/cancel`, { method: 'POST', body: { reason } }),
    reschedule: (id, departureTime) => api(`/supplier/departures/${id}/reschedule`, { method: 'POST', body: { departureTime } }),
  },
  hotel: {
    get: (opts) => api('/supplier/hotel', opts),
    update: (body) => api('/supplier/hotel', { method: 'PUT', body }),
    uploads: (opts) => api('/supplier/hotel/photos', opts),
    upload: (blob) => uploadBlob('/supplier/hotel/photos', blob),
    removeUpload: (id) => api(`/supplier/hotel/photos/${id}`, { method: 'DELETE' }),
  },
  reservations: (query, opts) => api('/supplier/reservations', { query, ...opts }),
  cancelReservation: (id, reason) => api(`/supplier/reservations/${id}/cancel`, { method: 'POST', body: { reason } }),
  rateCard: (opts) => api('/supplier/rate-card', opts),
  saveRateCard: (rateCard) => api('/supplier/rate-card', { method: 'PUT', body: { rateCard } }),
  previewRateCard: (rateCard, sample) => api('/supplier/rate-card/preview', { method: 'POST', body: { rateCard, sample } }),
  policies: (opts) => api('/supplier/policies', opts),
  savePolicies: (body) => api('/supplier/policies', { method: 'PUT', body }),
  specialRequests: (query, opts) => api('/supplier/special-requests', { query, ...opts }),
  replyRequest: (bookingId, body) => api(`/supplier/special-requests/${bookingId}/reply`, { method: 'POST', body }),
  tickets: (opts) => api('/supplier/tickets', opts),
  ticket: (id, opts) => api(`/supplier/tickets/${id}`, opts),
  replyTicket: (id, message) => api(`/supplier/tickets/${id}/messages`, { method: 'POST', body: { message } }),
  offers: offerAdmin('/supplier'),
};

export const adminApi = {
  audit: (query, opts) => api('/admin/audit', { query, ...opts }),
  suppliers: (opts) => api('/admin/suppliers', opts),
  bookings: (query, opts) => api('/admin/bookings', { query, ...opts }),
  booking: (ref, opts) => api(`/admin/bookings/${encodeURIComponent(ref)}`, opts),
  specialRequests: (opts) => api('/admin/special-requests', opts),
  tickets: (query, opts) => api('/admin/tickets', { query, ...opts }),
  ticket: (id, opts) => api(`/admin/tickets/${id}`, opts),
  replyTicket: (id, message) => api(`/admin/tickets/${id}/reply`, { method: 'POST', body: { message } }),
  closeTicket: (id) => api(`/admin/tickets/${id}/close`, { method: 'POST' }),
  escalateTicket: (id, message) => api(`/admin/tickets/${id}/escalate`, { method: 'POST', body: message ? { message } : {} }),
  offers: offerAdmin('/admin'),
  templates: (opts) => api('/admin/templates', opts),
  saveTemplate: (key, body) => api(`/admin/templates/${key}`, { method: 'PUT', body }),
  commission: (opts) => api('/admin/settings/commission', opts),
  saveCommission: (rate) => api('/admin/settings/commission', { method: 'PUT', body: { rate } }),
};
