import { HttpError } from './errors.js';

/**
 * Validates req[source] with a zod schema.
 * The parsed (trimmed, coerced) value is stored on req.valid[source].
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    // details[].message are translation keys (v.*); errorHandler translates them into the request language
    return next(new HttpError(400, 'VALIDATION_ERROR', { details, firstDetail: true }));
  }
  req.valid = { ...(req.valid || {}), [source]: result.data };
  next();
};
