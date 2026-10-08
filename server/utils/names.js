import { z } from 'zod';

// Letters from any script (so Devanagari, Tamil, etc. work) plus spaces, apostrophes, hyphens and dots.
// Must start with a letter. Rejects digits and emoji — traveller names must match an ID document.
export const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export const NAME_MAX = 80;
export const NAME_PART_MAX = 40;

export const personName = (emptyMessage = 'Enter the full name') =>
  z
    .string()
    .trim()
    .min(1, emptyMessage)
    .min(2, 'Enter the full name')
    .max(NAME_MAX, `Names can be at most ${NAME_MAX} characters`)
    .regex(NAME_PATTERN, 'Use letters only — spaces, apostrophes, hyphens and dots are fine');

// First or last name on its own (Phase 2 split names): the same rule, 1–40 characters each.
export const namePart = (label) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(NAME_PART_MAX, `${label[0].toUpperCase()}${label.slice(1)}s can be at most ${NAME_PART_MAX} characters`)
    .regex(NAME_PATTERN, 'Use letters only — spaces, apostrophes, hyphens and dots are fine');

export const splitName = z
  .object({ firstName: namePart('first name'), lastName: namePart('last name') })
  .refine((p) => `${p.firstName} ${p.lastName}`.length >= 2 && `${p.firstName} ${p.lastName}`.length <= NAME_MAX, {
    message: `Names can be at most ${NAME_MAX} characters in total`,
    path: ['lastName'],
  });
