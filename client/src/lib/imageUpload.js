// Prepares a hotel photo for upload in the browser: checks the type and size, then re-draws it on a
// canvas at most 1600px on the long side and saves it as a JPEG under the server's limit. Re-drawing
// also drops hidden metadata such as camera GPS location.

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // what we'll try to shrink
const MAX_EDGE = 1600;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file couldn’t be read as an image.'));
    };
    img.src = url;
  });
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export async function prepareHotelPhoto(file, maxBytes) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is over 15 MB. Choose a smaller one.');
  const img = await loadImage(file);
  if (img.naturalWidth < 400 || img.naturalHeight < 300) throw new Error('Photos need to be at least 400 × 300 pixels.');

  for (const edge of [MAX_EDGE, 1280, 1024]) {
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.72, 0.62]) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) return blob;
    }
  }
  throw new Error('That image couldn’t be made small enough. Try a simpler photo.');
}
