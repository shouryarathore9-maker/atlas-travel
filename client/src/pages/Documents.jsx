import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import QrCode from "../components/QrCode.jsx";
import { Banner, ErrorState, Spinner } from "../components/States.jsx";
import { bookingsApi } from "../api/resources.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPrice,
  formatTime,
} from "../lib/format.js";

// E-ticket (flights), voucher (hotels) and boarding passes (prd.md → Workflows 22–23).
// Printable with the browser; nothing is generated on the server.
export default function Documents() {
  const { reference } = useParams();
  const [params] = useSearchParams();
  const { data, error, reload, setData } = useAsync(
    (signal) => bookingsApi.documents(reference, { signal }),
    [reference],
  );
  const [checkIn, setCheckIn] = useState({ busy: false, error: null });
  const isFlight = data?.booking.type === "flight";
  useDocumentTitle(
    data
      ? isFlight
        ? `E-ticket ${reference}`
        : `Voucher ${reference}`
      : "Travel documents",
  );

  if (error) {
    return (
      <main id="main" className="container page">
        <ErrorState
          error={error}
          onRetry={error.status === 404 ? undefined : reload}
          title={error.status === 404 ? "Booking not found" : undefined}
        />
      </main>
    );
  }
  if (!data) return <Spinner label="Fetching your documents…" />;

  async function doCheckIn() {
    setCheckIn({ busy: true, error: null });
    try {
      setData(await bookingsApi.checkIn(reference));
      setCheckIn({ busy: false, error: null });
    } catch (err) {
      setCheckIn({ busy: false, error: err.message });
    }
  }

  const { booking } = data;
  const wantPasses =
    params.get("view") === "passes" || params.get("view") === "check-in";
  return (
    <main id="main" className="container page documents">
      <div className="row no-print documents-actions">
        <Link to="/bookings" className="btn-text back-link">
          ← My trips
        </Link>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      {isFlight &&
        data.checkIn &&
        !data.passes.length &&
        booking.status === "confirmed" && (
          <section
            className={`card no-print checkin-card ${wantPasses ? "is-focus" : ""}`}
          >
            <h2 className="h3">Web check-in</h2>
            {booking.travellers.some((t) => t.ageCategory === "infant") ? (
              <p>Travellers with an infant check in at the airport counter.</p>
            ) : data.checkIn.open ? (
              <>
                <p>
                  Check in now to get your seats and boarding passes. Travellers
                  without a seat get one assigned.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={doCheckIn}
                  disabled={checkIn.busy}
                >
                  {checkIn.busy ? "Checking in…" : "Check in"}
                </button>
              </>
            ) : new Date() < new Date(data.checkIn.opensAt) ? (
              <p>Check-in opens {formatDateTime(data.checkIn.opensAt)}.</p>
            ) : (
              <p>Check-in has closed — please check in at the airport.</p>
            )}
            {checkIn.error && <p className="field-error">{checkIn.error}</p>}
          </section>
        )}

      {isFlight && data.passes.length > 0 && (
        <section aria-labelledby="passes-heading" className="passes">
          <h2 id="passes-heading" className="no-print">
            Boarding passes
          </h2>
          {data.passes.map((p) => {
            const t = booking.travellers[p.travellerIndex];
            return (
              <article key={p.travellerIndex} className="boarding-pass">
                <div className="bp-main">
                  <p className="eyebrow">
                    Boarding pass · {data.flight.airline}
                  </p>
                  <p className="bp-route">
                    {data.flight.origin.code} → {data.flight.destination.code}
                  </p>
                  <dl className="bp-grid">
                    <div>
                      <dt>Passenger</dt>
                      <dd>{t.name}</dd>
                    </div>
                    <div>
                      <dt>Flight</dt>
                      <dd>{data.flight.flightNumber}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>
                        {formatDate(data.flight.departureTime, {
                          weekday: "short",
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Cabin</dt>
                      <dd>
                        {booking.selection.cabin === "business"
                          ? "Business"
                          : "Economy"}
                      </dd>
                    </div>
                    <div>
                      <dt>Seat</dt>
                      <dd className="bp-big">{p.seat}</dd>
                    </div>
                    <div>
                      <dt>Gate</dt>
                      <dd className="bp-big">{p.gate}</dd>
                    </div>
                    <div>
                      <dt>Boarding</dt>
                      <dd className="bp-big">{formatTime(p.boardingTime)}</dd>
                    </div>
                    <div>
                      <dt>Sequence</dt>
                      <dd>{String(p.sequence).padStart(3, "0")}</dd>
                    </div>
                  </dl>
                  <p className="small muted">
                    Departs {formatTime(data.flight.departureTime)} from{" "}
                    {data.flight.origin.terminal}. Booking{" "}
                    {booking.bookingReference} · PNR {booking.pnr}. Gate and
                    boarding time are simulated.
                  </p>
                </div>
                <div className="bp-qr">
                  <QrCode
                    value={p.qr}
                    size={150}
                    label={`Boarding pass code for ${t.name}`}
                  />
                </div>
              </article>
            );
          })}
        </section>
      )}

      {booking.status === "cancelled" && (
        <Banner tone="error">
          <p>Cancelled — this booking is no longer valid for travel.</p>
        </Banner>
      )}

      {isFlight ? <ETicket data={data} /> : <Voucher booking={booking} />}
    </main>
  );
}

function ETicket({ data }) {
  const { booking, flight } = data;
  const f = booking.fareBreakdown;
  return (
    <article
      className={`travel-doc ${booking.status === "cancelled" ? "is-cancelled" : ""}`}
      aria-label="E-ticket"
    >
      <header className="doc-band">
        <span className="logo">Atlas</span>
        <div className="doc-band-ref">
          <p className="eyebrow">E-ticket</p>
          <p>
            Booking <strong>{booking.bookingReference}</strong> · PNR{" "}
            <strong>{booking.pnr}</strong>
          </p>
        </div>
      </header>
      {flight && (
        <section className="doc-flight">
          <p className="eyebrow">
            {flight.airline} {flight.flightNumber} ·{" "}
            {booking.selection.cabin === "business" ? "Business" : "Economy"} ·{" "}
            {booking.selection.fareType}
          </p>
          <div className="doc-times">
            <div>
              <p className="time-lg">{formatTime(flight.departureTime)}</p>
              <p className="small">
                {flight.origin.city} ({flight.origin.code}) ·{" "}
                {flight.origin.terminal}
              </p>
              <p className="small muted">{flight.origin.airport}</p>
              <p className="small">
                {formatDate(flight.departureTime, { weekday: "short" })}
              </p>
            </div>
            <p className="small muted">
              {formatDuration(flight.durationMinutes)}
            </p>
            <div>
              <p className="time-lg">{formatTime(flight.arrivalTime)}</p>
              <p className="small">
                {flight.destination.city} ({flight.destination.code}) ·{" "}
                {flight.destination.terminal}
              </p>
              <p className="small muted">{flight.destination.airport}</p>
              <p className="small">
                {formatDate(flight.arrivalTime, { weekday: "short" })}
              </p>
            </div>
          </div>
        </section>
      )}
      <div className="table-wrap doc-table-wrap">
        <table className="admin-table doc-table">
          <thead>
            <tr>
              <th scope="col">Passenger</th>
              <th scope="col">Type</th>
              <th scope="col">E-ticket number</th>
              <th scope="col">Seat</th>
              <th scope="col">Meal</th>
            </tr>
          </thead>
          <tbody>
            {booking.travellers.map((t, i) => (
              <tr key={i}>
                <td>{t.name}</td>
                <td>{t.ageCategory}</td>
                <td>{t.ticketNumber}</td>
                <td>
                  {t.ageCategory === "infant"
                    ? "On lap"
                    : t.seat || "Assigned at check-in"}
                </td>
                <td>{t.meal || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="doc-columns">
        <section>
          <h3 className="h4">Fare</h3>
          <dl className="price-lines">
            <div className="price-line">
              <dt>Base fare</dt>
              <dd>{formatPrice(f.base)}</dd>
            </div>
            {f.discounts > 0 && (
              <div className="price-line price-line-offer">
                <dt>{booking.offer?.code || booking.offer?.title}</dt>
                <dd>−{formatPrice(f.discounts)}</dd>
              </div>
            )}
            {f.infantFees > 0 && (
              <div className="price-line">
                <dt>Infant fees</dt>
                <dd>{formatPrice(f.infantFees)}</dd>
              </div>
            )}
            {f.addons > 0 && (
              <div className="price-line">
                <dt>Seats &amp; meals</dt>
                <dd>{formatPrice(f.addons)}</dd>
              </div>
            )}
            <div className="price-line">
              <dt>Taxes</dt>
              <dd>{formatPrice(f.taxes)}</dd>
            </div>
            <div className="price-line price-total">
              <dt>
                Paid (
                {booking.status === "cancelled"
                  ? "cancelled"
                  : "payment successful"}
                )
              </dt>
              <dd>{formatPrice(f.total)}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3 className="h4">Terms</h3>
          <p className="small">{booking.policySnapshot?.terms}</p>
          <p className="small">Date changes aren’t available on Atlas yet.</p>
          <h3 className="h4">Before you fly</h3>
          <ul className="small">
            <li>
              Carry a government photo ID (Aadhaar, passport, driving licence or
              voter ID).
            </li>
            <li>
              Web check-in opens 48 hours before departure and closes 60 minutes
              before.
            </li>
            <li>
              Atlas support: help@atlas.test · this is a simulated booking.
            </li>
          </ul>
        </section>
      </div>
      <div className="doc-qr">
        <QrCode
          value={data.qr}
          size={120}
          label={`Booking code for ${booking.bookingReference}`}
        />
        <p className="small muted">
          Simulated code — it carries only your booking reference.
        </p>
      </div>
    </article>
  );
}

function Voucher({ booking }) {
  const f = booking.fareBreakdown;
  const reply = booking.specialRequest?.reply;
  return (
    <article
      className={`travel-doc ${booking.status === "cancelled" ? "is-cancelled" : ""}`}
      aria-label="Hotel voucher"
    >
      <header className="doc-band">
        <span className="logo">Atlas</span>
        <div className="doc-band-ref">
          <p className="eyebrow">Hotel voucher</p>
          <p>
            Booking <strong>{booking.bookingReference}</strong>
          </p>
        </div>
      </header>
      <section className="doc-flight">
        <h2 className="h3">{booking.itemSummary.title}</h2>
        <p className="small">{booking.itemSummary.subtitle}</p>
        <div className="doc-times">
          <div>
            <p className="eyebrow">Check-in</p>
            <p className="time-lg">
              {formatDate(booking.travelDates.start, { weekday: "short" })}
            </p>
          </div>
          <div>
            <p className="eyebrow">Check-out</p>
            <p className="time-lg">
              {formatDate(booking.travelDates.end, { weekday: "short" })}
            </p>
          </div>
        </div>
      </section>
      <dl className="facts">
        <div>
          <dt>Guest</dt>
          <dd>{booking.travellers.map((t) => t.name).join(", ")}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>
            {booking.selection.roomTypeName} × {booking.selection.rooms} ·{" "}
            {booking.selection.ratePlan === "nonrefundable"
              ? "Non-refundable"
              : "Flexible"}
          </dd>
        </div>
        <div>
          <dt>Meals</dt>
          <dd>
            {booking.selection.breakfastIncluded
              ? "Breakfast included"
              : booking.selection.breakfast
                ? "Breakfast added"
                : "Room only"}
          </dd>
        </div>
        <div>
          <dt>Cancellation</dt>
          <dd>{booking.policySnapshot?.terms}</dd>
        </div>
        {booking.specialRequest?.text && (
          <div>
            <dt>Special request</dt>
            <dd>
              {booking.specialRequest.text}
              {reply && (
                <span className="block small muted">
                  Hotel:{" "}
                  {reply.status === "accepted"
                    ? "accepted"
                    : "can’t accommodate"}
                  {reply.comment ? ` — ${reply.comment}` : ""}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
      <dl className="price-lines">
        <div className="price-line">
          <dt>Room charges</dt>
          <dd>{formatPrice(f.base)}</dd>
        </div>
        {f.discounts > 0 && (
          <div className="price-line price-line-offer">
            <dt>{booking.offer?.code || booking.offer?.title}</dt>
            <dd>−{formatPrice(f.discounts)}</dd>
          </div>
        )}
        {f.breakfast > 0 && (
          <div className="price-line">
            <dt>Breakfast</dt>
            <dd>{formatPrice(f.breakfast)}</dd>
          </div>
        )}
        <div className="price-line">
          <dt>Taxes</dt>
          <dd>{formatPrice(f.taxes)}</dd>
        </div>
        <div className="price-line price-total">
          <dt>Paid</dt>
          <dd>{formatPrice(f.total)}</dd>
        </div>
      </dl>
    </article>
  );
}
