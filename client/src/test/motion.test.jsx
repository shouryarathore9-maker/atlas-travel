import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CountUp from '../components/CountUp.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import Reveal from '../components/Reveal.jsx';
import { Spinner } from '../components/States.jsx';
import { formatPrice } from '../lib/format.js';
import { requestStarted, startProgressNow } from '../lib/progress.js';

// A controllable IntersectionObserver: `showAll()` reports every observed element as on screen.
const instances = [];
class MockIntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    this.targets = new Set();
    instances.push(this);
  }
  observe(el) {
    this.targets.add(el);
  }
  unobserve(el) {
    this.targets.delete(el);
  }
  disconnect() {}
}
const showAll = () =>
  act(() => {
    for (const io of instances) io.cb([...io.targets].map((target) => ({ target, isIntersecting: true })));
  });

const reducedMotion = (matches) => vi.stubGlobal('matchMedia', (query) => ({ matches: matches && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));

describe('CountUp', () => {
  let frames;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts even when the device asks for reduced motion (owner’s choice)', () => {
    reducedMotion(true);
    const { container } = render(<CountUp value={12345} format={formatPrice} />);
    expect(container.querySelector('.count-up-live')).toHaveTextContent('₹0');
    expect(container.querySelector('.count-up-final')).toHaveTextContent('₹12,345');
  });

  it('keeps the final value readable while counting, then settles on it — without waiting for a scroll', () => {
    reducedMotion(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container } = render(<CountUp value={12345} format={formatPrice} />);
    // The moving number is hidden from screen readers; the final one is not.
    expect(container.querySelector('.count-up-live')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.count-up-live')).toHaveTextContent('₹0');
    expect(container.querySelector('.count-up-final')).toHaveTextContent('₹12,345');

    act(() => vi.advanceTimersByTime(250)); // the short pause before counting; no IntersectionObserver involved
    vi.useRealTimers();
    expect(frames).toHaveLength(1);
    act(() => frames.shift()(performance.now() + 10_000)); // jump past the end of the animation
    expect(container.querySelector('.is-counting')).toBeNull();
    expect(screen.getByText('₹12,345')).toBeInTheDocument();
  });

  it('every number on a page starts counting at the same moment', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(
      <>
        <CountUp value={100} />
        <CountUp value={5000} />
      </>,
    );
    expect(frames).toHaveLength(0);
    act(() => vi.advanceTimersByTime(250));
    vi.useRealTimers();
    expect(frames).toHaveLength(2);
  });

  it('formats ratings with one decimal like before', () => {
    const { container } = render(<CountUp value={4.25} decimals={1} format={(n) => n.toFixed(1)} />);
    expect(container.querySelector('.count-up-final')).toHaveTextContent('4.3');
  });
});

describe('Reveal', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('requestAnimationFrame', (fn) => fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('slides content in when it comes into view, on arrival too', () => {
    render(<Reveal data-testid="r">Hello</Reveal>);
    expect(screen.getByTestId('r')).toHaveClass('reveal');
    showAll();
    expect(screen.getByTestId('r')).toHaveClass('is-revealed');
  });

  it('staggers elements that appear together', () => {
    render(
      <>
        <Reveal data-testid="a">A</Reveal>
        <Reveal data-testid="b">B</Reveal>
      </>,
    );
    showAll();
    const delay = (id) => parseInt(screen.getByTestId(id).style.getPropertyValue('--reveal-delay'), 10);
    expect(delay('b')).toBeGreaterThan(delay('a'));
  });

  it('does nothing without IntersectionObserver', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('IntersectionObserver', undefined);
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 });
    render(<Reveal data-testid="r">Plain</Reveal>);
    rect.mockRestore();
    expect(screen.getByTestId('r')).not.toHaveClass('reveal');
  });
});

describe('Loading feedback', () => {
  afterEach(() => vi.useRealTimers());

  it('Spinner is still a status region with its text', () => {
    render(<Spinner label="Processing payment…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Processing payment…');
  });

  it('progress bar waits ~150ms so fast requests never flash, then shows until requests finish', () => {
    vi.useFakeTimers();
    const { container } = render(<ProgressBar />);
    let done;
    act(() => {
      done = requestStarted();
    });
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('.top-progress')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('.top-progress')).not.toBeNull();
    act(() => done());
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.top-progress')).toBeNull();

    // A fast request never shows the bar.
    act(() => {
      done = requestStarted();
    });
    act(() => vi.advanceTimersByTime(50));
    act(() => done());
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.top-progress')).toBeNull();
  });

  it('a search shows the bar immediately', () => {
    vi.useFakeTimers();
    const { container } = render(<ProgressBar />);
    let release;
    act(() => {
      release = startProgressNow();
    });
    expect(container.querySelector('.top-progress')).not.toBeNull();
    act(() => release());
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.top-progress')).toBeNull();
  });
});
