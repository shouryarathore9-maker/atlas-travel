import { useState } from 'react';

// Seeded hotel and offer photos also exist at 480px wide (`name-480.jpg`), so phones and small cards
// don't download the 960px file (design.md → Phone layouts → Images).
const HAS_SMALL = /^\/images\/seed\/(hotels|offers)\/[^/]+\.jpg$/;
const srcSetFor = (src) => (src && HAS_SMALL.test(src) ? `${src.replace(/\.jpg$/, '-480.jpg')} 480w, ${src} 960w` : undefined);

// Shows a warm gradient with a caption if the image is missing, so layouts never collapse.
export default function SmartImage({ src, alt, caption, className = '', style, eager = false, sizes }) {
  const [failed, setFailed] = useState(!src);
  return (
    <div className={`img-frame ${className}`} style={style}>
      {!failed && (
        <img
          src={src}
          srcSet={srcSetFor(src)}
          alt={alt}
          sizes={srcSetFor(src) ? sizes || '(min-width: 768px) 33vw, 75vw' : sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {failed && caption && (
        <span className="img-fallback" aria-hidden="true">
          {caption}
        </span>
      )}
    </div>
  );
}
