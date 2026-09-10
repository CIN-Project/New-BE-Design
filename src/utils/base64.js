/**
 * UTF-8-safe base64 encode for promo codes, ported 1:1 from real Amritara's
 * Filterbar.js/DetailStep.js encodeBase64 — plain btoa() throws (or silently
 * mangles) on any non-Latin1 character a guest might type into Promo Code,
 * this doesn't.
 */
export function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
