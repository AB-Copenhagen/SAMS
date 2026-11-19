// Best-effort redaction for exception messages reported to PostHog (gh-118). Only scrubs the
// message string — stack frames and arbitrary variable values can't be reliably scrubbed, so
// this is a defense against the common case (an email or token incidentally interpolated into
// an error message), not a guarantee against all possible PII in a captured exception.
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g;

export function redactErrorMessage(message: string): string {
  return message.replace(EMAIL_PATTERN, '[redacted-email]').replace(TOKEN_PATTERN, '[redacted-token]');
}

// Applies the same redaction to both the message and the stack trace (which usually repeats the
// message on its first line) before the error reaches PostHog.
export function redactError(error: Error): Error {
  const redacted = new Error(redactErrorMessage(error.message));
  redacted.name = error.name;
  redacted.stack = error.stack ? redactErrorMessage(error.stack) : error.stack;
  return redacted;
}
