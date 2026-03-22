/**
 * Result type for expected errors (Railway-Oriented Programming).
 * Use for: validation, parsing, network, media operations.
 */

/** @typedef {{ success: true; data: T }} SuccessResult
 * @template T */

/** @typedef {{ success: false; error: { code: string; message: string; details?: unknown } }} ErrorResult */

/** @typedef {SuccessResult<T> | ErrorResult} Result
 * @template T */

/**
 * @template T
 * @param {T} data
 * @returns {SuccessResult<T>}
 */
export function ok(data) {
  return { success: true, data };
}

/**
 * @param {string} code
 * @param {string} message
 * @param {unknown} [details]
 * @returns {ErrorResult}
 */
export function err(code, message, details) {
  return {
    success: false,
    error: { code, message, details },
  };
}

/**
 * @template T, U
 * @param {Result<T>} result
 * @param {(data: T) => Result<U>} fn
 * @returns {Result<U>}
 */
export function flatMap(result, fn) {
  if (!result.success) return result;
  return fn(result.data);
}

/**
 * @template T, U
 * @param {Result<T>} result
 * @param {(data: T) => U} fn
 * @returns {Result<U>}
 */
export function map(result, fn) {
  if (!result.success) return result;
  return ok(fn(result.data));
}
