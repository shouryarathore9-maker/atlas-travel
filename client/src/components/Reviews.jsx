import { useState } from 'react';
import { reviewsApi } from '../api/resources.js';
import { formatDate, pluralize } from '../lib/format.js';

export default function Reviews({ itemType, itemId, rating, initialReviews = [] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasMore = reviews.length < (rating?.count || 0);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      // The detail endpoint returned the first 5; page through the rest 5 at a time.
      const next = page + 1;
      const res = await reviewsApi.list({ itemType, itemId, page: next, limit: 5 });
      setReviews((r) => [...r, ...res.reviews.filter((x) => !r.some((y) => y._id === x._id))]);
      setPage(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="detail-section" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Ratings &amp; reviews</h2>
      {!rating?.count ? (
        <p className="muted">No reviews yet. Be among the first travellers here.</p>
      ) : (
        <>
          <div className="review-summary">
            <span className="review-average">{rating.average.toFixed(1)}</span>
            <div>
              <p className="stars" aria-hidden="true">
                {'★'.repeat(Math.round(rating.average))}
                {'☆'.repeat(5 - Math.round(rating.average))}
              </p>
              <p className="small muted">
                <span className="sr-only">Average rating {rating.average} out of 5, </span>
                {pluralize(rating.count, 'review')}
              </p>
            </div>
          </div>
          <ul className="review-list">
            {reviews.map((review) => (
              <li key={review._id} className="review">
                <div className="spread">
                  <strong>{review.authorName}</strong>
                  <span className="small muted">{formatDate(review.createdAt, { day: undefined })}</span>
                </div>
                <p className="stars small" aria-label={`${review.rating} out of 5`}>
                  {'★'.repeat(review.rating)}
                  <span aria-hidden="true" className="muted">
                    {'☆'.repeat(5 - review.rating)}
                  </span>
                </p>
                <p>{review.comment}</p>
              </li>
            ))}
          </ul>
          {error && <p className="field-error">{error}</p>}
          {hasMore && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadMore} disabled={loading}>
              {loading ? 'Loading…' : 'Show more reviews'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
