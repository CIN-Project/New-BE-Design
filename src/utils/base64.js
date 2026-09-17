/**
 * UTF-8-safe base64 encode for promo codes, ported 1:1 from real Amritara's
 * Filterbar.js/DetailStep.js encodeBase64 — plain btoa() throws (or silently
 * mangles) on any non-Latin1 character a guest might type into Promo Code,
 * this doesn't.
 */
export function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Inverse of encodeBase64 above — UTF-8-safe base64 decode, ported 1:1 from
 * real Amritara's FormContext.js `pid` decoding (~71: `decodeURIComponent(
 * escape(atob(pid)))`). Used by ghaDeepLink.js to recover the real
 * staahPropertyId a Google Hotel Ads link encodes into its `pid` param.
 */
export function decodeBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}
