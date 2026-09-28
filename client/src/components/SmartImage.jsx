import { useState } from 'react';

// Shows a warm gradient with a caption if the image is missing, so layouts never collapse.
export default function SmartImage({ src, alt, caption, className = '', style, eager = false, sizes }) {
  const [failed, setFailed] = useState(!src);
  return (
    <div className={`img-frame ${className}`} style={style}>
      {!failed && (
        <img
          src={src}
          alt={alt}
          sizes={sizes}
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
