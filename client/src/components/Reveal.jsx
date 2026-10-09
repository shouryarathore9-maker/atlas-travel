import { useReveal } from '../hooks/useReveal.js';

// Wraps content that sits below the fold so it fades in once when scrolled to (see useReveal).
// `as` picks the element (section, li, div…); every other prop is passed through.
export default function Reveal({ as: Tag = 'div', children, ...props }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} {...props}>
      {children}
    </Tag>
  );
}
