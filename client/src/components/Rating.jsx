import { pluralize } from '../lib/format.js';

export function RatingBadge({ rating }) {
  if (!rating?.count) return <span className="small muted">No reviews yet</span>;
  return (
    <span className="rating">
      <span className="rating-score" aria-label={`Rated ${rating.average} out of 5`}>
        {rating.average.toFixed(1)}
      </span>
      <span className="muted">{pluralize(rating.count, 'review')}</span>
    </span>
  );
}

export function Stars({ count }) {
  return (
    <span className="stars" aria-label={`${count}-star hotel`}>
      {'★'.repeat(count)}
    </span>
  );
}
