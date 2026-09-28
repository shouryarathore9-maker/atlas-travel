import { z } from 'zod';

// "a,b,c" -> ["a","b","c"]; missing/empty -> []
export const csv = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []));

export const optionalNumber = z.coerce.number().nonnegative().optional();

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export function paginate(items, page, limit) {
  const total = items.length;
  return {
    results: items.slice((page - 1) * limit, page * limit),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
