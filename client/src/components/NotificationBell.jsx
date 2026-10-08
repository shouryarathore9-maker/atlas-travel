import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { notificationsApi } from '../api/resources.js';
import { timeAgo } from '../lib/format.js';

const POLL_MS = 60 * 1000;

// Header bell with an unread count (prd.md → Notification panel). The count is polled on every
// page change and once a minute while the tab is visible — one small indexed query, no websockets.
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  const refreshCount = useCallback(() => {
    notificationsApi
      .unread()
      .then(({ unread }) => setUnread(unread))
      .catch(() => {}); // the bell is non-essential; never surface polling errors
  }, []);

  useEffect(() => {
    refreshCount();
  }, [location.pathname, refreshCount]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshCount();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshCount]);

  const load = useCallback(() => {
    setError(null);
    notificationsApi
      .list()
      .then(({ notifications, unread }) => {
        setItems(notifications);
        setUnread(unread);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    load();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, load]);

  // Close when the page changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  async function openItem(n) {
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationsApi.read(n._id).catch(() => {});
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    setItems((list) => list?.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
    try {
      await notificationsApi.readAll();
    } catch {
      refreshCount();
    }
  }

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn bell-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={22} />
        {unread > 0 && (
          <span className="bell-count" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-panel-head">
            <h2 className="h4">Notifications</h2>
            <button type="button" className="btn-text small" onClick={markAll} disabled={!unread}>
              Mark all as read
            </button>
          </div>
          {error && (
            <p className="small muted bell-empty">
              Notifications didn’t load.{' '}
              <button type="button" className="btn-text small" onClick={load}>
                Try again
              </button>
            </p>
          )}
          {!error && !items && <p className="small muted bell-empty">Loading…</p>}
          {items && items.length === 0 && <p className="small muted bell-empty">You’re all caught up.</p>}
          {items && items.length > 0 && (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n._id}>
                  <button type="button" className={`bell-item ${n.readAt ? '' : 'is-unread'}`} onClick={() => openItem(n)}>
                    <span className="bell-dot" aria-hidden="true" />
                    <span className="bell-text">
                      <span className="bell-title">
                        {!n.readAt && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      {n.body && <span className="bell-body">{n.body}</span>}
                      <span className="bell-time">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
