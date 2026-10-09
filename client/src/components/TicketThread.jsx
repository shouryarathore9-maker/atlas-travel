import { useState } from 'react';
import Field from './Field.jsx';
import { formatDateTime } from '../lib/format.js';

export const TICKET_STATUS = {
  open: { label: 'Open', tone: 'badge-olive' },
  escalated: { label: 'Waiting for the airline/hotel', tone: 'badge-olive' },
  answered: { label: 'Answered', tone: 'badge-success' },
  closed: { label: 'Closed', tone: 'badge-muted' },
  resolved: { label: 'Resolved', tone: 'badge-muted' },
};

const AUTHOR = { traveller: 'Traveller', admin: 'Atlas support', supplier: 'Airline / hotel' };

// A help-ticket conversation. `me` is the viewer's role, whose messages sit on the right.
// Messages are rendered as text (never HTML).
export default function TicketThread({ ticket, me, onReply, replyLabel = 'Send reply', actions }) {
  const [message, setMessage] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  const status = TICKET_STATUS[ticket.status] || { label: ticket.status, tone: '' };

  async function submit(e) {
    e.preventDefault();
    if (message.trim().length < 2) {
      setState({ busy: false, error: 'Write a reply' });
      return;
    }
    setState({ busy: true, error: null });
    try {
      await onReply(message.trim());
      setMessage('');
      setState({ busy: false, error: null });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  return (
    <div className="ticket">
      <div className="spread">
        <p className="small muted">
          {ticket.type === 'statement_query' ? 'Statement query' : 'Help ticket'} · {ticket.bookingReference} · opened {formatDateTime(ticket.createdAt)}
        </p>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </div>
      <ol className="ticket-messages">
        {ticket.messages.map((m, i) => (
          <li key={i} className={`ticket-message ${m.authorRole === me ? 'is-mine' : ''}`}>
            <p className="small ticket-author">
              {m.authorRole === 'supplier' ? m.authorName : AUTHOR[m.authorRole]} · {formatDateTime(m.at)}
            </p>
            <p className="ticket-body">{m.body}</p>
          </li>
        ))}
      </ol>
      {actions}
      {ticket.canReply && onReply && (
        <form onSubmit={submit} noValidate className="stack ticket-reply">
          <Field as="textarea" label="Reply" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} error={state.error} />
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy} aria-busy={state.busy || undefined}>
              {state.busy ? 'Sending…' : replyLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
