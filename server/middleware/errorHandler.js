import { ZodError } from 'zod';

export function notFound(req, res) {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
}

// Every error leaves the API in the same shape: { error: { message, code, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return res.status(400).json({
      error: { message: details[0]?.message || 'Invalid request', code: 'VALIDATION_ERROR', details },
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: { message: 'Invalid identifier', code: 'INVALID_ID' } });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: { message: err.message, code: 'VALIDATION_ERROR' } });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: { message: 'That record already exists', code: 'DUPLICATE' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'That file or request is too large.', code: 'TOO_LARGE' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Malformed JSON body', code: 'BAD_JSON' } });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      message: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
      code: err.code && typeof err.code === 'string' ? err.code : 'SERVER_ERROR',
    },
  });
}
