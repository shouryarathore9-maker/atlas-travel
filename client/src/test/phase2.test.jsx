import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notifications = [
  { _id: 'n1', title: 'New reservation ATF7S2LK', body: 'Deluxe Room · 2 nights', link: '/supplier', readAt: null, createdAt: new Date().toISOString() },
  { _id: 'n2', title: 'Older note', body: '', link: '', readAt: new Date().toISOString(), createdAt: new Date(Date.now() - 3 * 3600e3).toISOString() },
];

vi.mock('../api/resources.js', () => ({
  notificationsApi: {
    unread: vi.fn(() => Promise.resolve({ unread: 1 })),
    list: vi.fn(() => Promise.resolve({ notifications, unread: 1 })),
    read: vi.fn(() => Promise.resolve({ ok: true })),
    readAll: vi.fn(() => Promise.resolve({ ok: true })),
  },
}));

let mockUser = null;
vi.mock('../hooks/useAuth.jsx', () => ({ useAuth: () => ({ user: mockUser, status: 'ready' }) }));

const { notificationsApi } = await import('../api/resources.js');
const { default: NotificationBell } = await import('../components/NotificationBell.jsx');
const { default: ProtectedRoute } = await import('../components/ProtectedRoute.jsx');
const { timeAgo } = await import('../lib/format.js');

function Where() {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} {location.state?.notice}
    </p>
  );
}

describe('Notification bell (story #29)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the unread count, lists notifications and marks all as read', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    expect(await screen.findByText('New reservation ATF7S2LK')).toBeInTheDocument();
    expect(screen.getByText('Unread:', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(notificationsApi.readAll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(timeAgo('2026-10-08T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-08T11:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2026-10-08T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-07T10:00:00Z', now)).toBe('yesterday');
  });
});

describe('Role-gated pages', () => {
  afterEach(() => {
    mockUser = null;
  });

  const renderAt = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/checkout" element={<ProtectedRoute role="traveler">checkout page</ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute role="admin">admin page</ProtectedRoute>} />
          <Route path="/supplier" element={<ProtectedRoute role="manager">supplier page</ProtectedRoute>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );

  it('sends staff away from booking pages to their console with a notice', () => {
    mockUser = { role: 'hotel_manager', name: 'The Marine Palm manager' };
    renderAt('/checkout');
    expect(screen.getByText('supplier page')).toBeInTheDocument();
  });

  it('keeps travellers out of the consoles', () => {
    mockUser = { role: 'traveler', name: 'Priya' };
    renderAt('/supplier');
    expect(screen.getByText(/at \/ That area is for airline and hotel managers only/)).toBeInTheDocument();
  });

  it('lets each role into its own area', () => {
    mockUser = { role: 'admin', name: 'Atlas Admin' };
    renderAt('/admin');
    expect(screen.getByText('admin page')).toBeInTheDocument();
  });
});
