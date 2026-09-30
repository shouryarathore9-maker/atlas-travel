import { z } from 'zod';

// Letters from any script (so Devanagari, Tamil, etc. work) plus spaces, apostrophes, hyphens and dots.
// Must start with a letter. Rejects digits and emoji — traveller names must match an ID document.
export const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export const NAME_MAX = 80;

export const personName = (emptyMessage = 'Enter the full name') =>
  z
    .string()
    .trim()
    .min(1, emptyMessage)
    .min(2, 'Enter the full name')
    .max(NAME_MAX, `Names can be at most ${NAME_MAX} characters`)
    .regex(NAME_PATTERN, 'Use letters only — spaces, apostrophes, hyphens and dots are fine');
