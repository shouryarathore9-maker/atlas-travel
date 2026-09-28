import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FlightSearchForm from '../components/FlightSearchForm.jsx';
import Reviews from '../components/Reviews.jsx';
import SeatMap from '../components/SeatMap.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
import Home from '../pages/Home.jsx';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(ui, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="*" element={<>{ui}<LocationProbe /></>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Home search card (story 1)', () => {
  it('defaults to Flights and switches tabs without leaving the page, keeping entered values', async () => {
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const user = userEvent.setup();
    renderAt(<Home />);

    expect(screen.getByRole('tab', { name: /flights/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /search flights/i })).toBeVisible();

    await user.selectOptions(screen.getByLabelText('To'), 'MAA');
    await user.click(screen.getByRole('tab', { name: /hotels/i }));
    expect(screen.getByRole('tab', { name: /hotels/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=hotels');
    expect(screen.getByRole('button', { name: /search stays/i })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: /flights/i }));
    expect(screen.getByLabelText('To')).toHaveValue('MAA');
  });
});

describe('Flight search form (story 2)', () => {
  it('disables search and highlights the first invalid field', async () => {
    const user = userEvent.setup();
    renderAt(<FlightSearchForm />);
    await user.selectOptions(screen.getByLabelText('From'), '');
    expect(screen.getByRole('button', { name: /search flights/i })).toBeDisabled();
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Choose where you are flying from')).toBeInTheDocument();
  });

  it('navigates to results with the search in the URL', async () => {
    const user = userEvent.setup();
    renderAt(<FlightSearchForm />);
    await user.click(screen.getByRole('button', { name: /search flights/i }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/flights\?origin=DEL&destination=BOM&date=\d{4}-\d{2}-\d{2}&travellers=1&cabin=economy$/);
  });
});

describe('Seat map (story 5)', () => {
  const seatMap = { rows: 2, columns: 6, unavailableSeats: ['1A'], seatPricing: { window: 350, aisle: 300, middle: 0 } };

  it('disables unavailable seats and announces seat details', async () => {
    const picked = [];
    const user = userEvent.setup();
    render(<SeatMap seatMap={seatMap} assigned={['']} onSelect={(s) => picked.push(s)} />);
    expect(screen.getByRole('button', { name: /Seat 1A, window, .*unavailable/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Seat 2C, aisle/ }));
    expect(picked).toEqual(['2C']);
  });
});

describe('Reviews (story 7)', () => {
  it('shows a neutral empty state when there are no reviews', () => {
    render(<Reviews itemType="hotel" itemId="x" rating={{ average: 0, count: 0 }} initialReviews={[]} />);
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
  });
});
