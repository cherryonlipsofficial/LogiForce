/**
 * An error the platform router sends to the client as
 * { success: false, message, code, ...extra } with `status`.
 */
class PlatformRequestError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.name = 'PlatformRequestError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const notFound = (message) => new PlatformRequestError(404, 'NOT_FOUND', message);
const badRequest = (message, errors) => new PlatformRequestError(400, 'VALIDATION_ERROR', message, errors ? { errors } : undefined);
const conflict = (code, message, extra) => new PlatformRequestError(409, code, message, extra);
const forbidden = (code, message) => new PlatformRequestError(403, code, message);

module.exports = { PlatformRequestError, notFound, badRequest, conflict, forbidden };
