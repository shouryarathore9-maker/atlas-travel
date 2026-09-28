// Parses req[source] with a zod schema and stores the typed result on req.validated[source].
// (Express 5 makes req.query read-only, so we never write back to it.)
export const validate = (schema, source = 'body') => (req, res, next) => {
  req.validated = req.validated || {};
  req.validated[source] = schema.parse(req[source] ?? {});
  next();
};
