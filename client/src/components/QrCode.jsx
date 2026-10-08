import { useEffect, useState } from 'react';

// QR codes are drawn in the browser (no server CPU, no third-party service). The payload is only a
// signed booking/passenger reference — never personal details. The library loads on demand.
export default function QrCode({ value, size = 140, label = 'QR code' }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#17221f', light: '#ffffff' } }))
      .then((svg) => alive && setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!src) return <div className="qr-placeholder" style={{ width: size, height: size }} aria-hidden="true" />;
  return <img src={src} width={size} height={size} alt={label} className="qr-code" />;
}
