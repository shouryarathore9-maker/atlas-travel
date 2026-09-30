import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import HotelCard from '../components/HotelCard.jsx';
import Lightbox from '../components/Lightbox.jsx';

const photos = ['/a.jpg', '/b.jpg', '/c.jpg'];

function Harness({ start = 0 }) {
  const [index, setIndex] = useState(start);
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">opener</button>
      {open && <Lightbox photos={photos} index={index} onIndexChange={setIndex} onClose={() => setOpen(false)} label="Test Hotel photos" />}
    </>
  );
}

const counter = () => screen.getByText(/\d \/ 3/).textContent;

describe('Lightbox (story #17)', () => {
  it('shows a counter and moves with arrow buttons and arrow keys, wrapping around', async () => {
    const user = userEvent.setup();
    render(<Harness start={1} />);
    expect(counter()).toBe('2 / 3');
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(counter()).toBe('3 / 3');
    await user.keyboard('{ArrowRight}');
    expect(counter()).toBe('1 / 3');
    await user.keyboard('{ArrowLeft}');
    expect(counter()).toBe('3 / 3');
  });

  it('moves between photos on horizontal swipes', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    fireEvent.touchStart(dialog, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 205 }] });
    expect(counter()).toBe('2 / 3');
  });

  it('closes on Escape, on the X button, and on a click outside the photo — but not on the photo', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('img', { name: /photo 1 of 3/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Close photo viewer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Hotel card (story #16)', () => {
  const hotel = {
    _id: 'h1',
    name: 'Test Courtyard',
    address: 'Fort, Mumbai',
    starRating: 5,
    amenities: ['Spa'],
    rating: { average: 4.5, count: 3 },
    price: 9000,
    nights: 2,
    photo: null,
  };

  it('covers the whole card with a link but exposes only one focusable link', () => {
    const { container } = render(
      <MemoryRouter>
        <HotelCard hotel={hotel} stayQuery="checkIn=2026-10-05&checkOut=2026-10-07" />
      </MemoryRouter>,
    );
    const overlay = container.querySelector('.card-overlay-link');
    expect(overlay).toHaveAttribute('href', '/hotels/h1?checkIn=2026-10-05&checkOut=2026-10-07');
    expect(overlay).toHaveAttribute('tabindex', '-1');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    // Only the real button is exposed to assistive tech and the tab order
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('See rooms at Test Courtyard');
    expect(links[0]).toHaveAttribute('href', overlay.getAttribute('href'));
  });
});
