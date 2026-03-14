/**
 * HTML escaping utilities for XSS prevention.
 */

/**
 * Escapes a string for safe use in HTML text content and attributes.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escapes a string for safe use in HTML attribute values (e.g. value="...").
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
