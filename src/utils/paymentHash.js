import CryptoJS from "crypto-js";
import md5 from "md5";

// MD5(key)-derived AES-128 key + this fixed IV, CBC/PKCS7 — matches
// Amritara's Node `crypto` implementation byte-for-byte (verified via a
// Node<->crypto-js cross-encrypt/decrypt test against the real partner
// key). IMPORTANT: build the IV via Hex.parse, NOT
// `WordArray.create([0,1,2,...,15], 16)` — crypto-js treats each array
// element as a full 32-bit word, not a single byte, so that construction
// silently produces a completely different 16-byte IV. Since AES-CBC only
// XORs the IV into the FIRST block (subsequent blocks chain off the
// previous ciphertext block instead), that bug corrupts exactly the first
// AES block of every decrypt while later blocks still come out looking
// right — which is exactly the "failing" symptom this replaced.
const FIXED_IV_HEX = "000102030405060708090a0b0c0d0e0f";

function deriveKey(key) {
  return CryptoJS.enc.Hex.parse(md5(key));
}

function fixedIv() {
  return CryptoJS.enc.Hex.parse(FIXED_IV_HEX);
}

export function encrypt(plainText, key) {
  return CryptoJS.AES.encrypt(plainText, deriveKey(key), {
    iv: fixedIv(),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext.toString(CryptoJS.enc.Hex);
}

export function encryptHash(partnerKey, data) {
  let text = "";
  Object.keys(data).forEach((key) => {
    text += `${key}=${data[key]}||`;
  });
  text = text.slice(0, -2);
  return encrypt(text, partnerKey);
}

/**
 * Inverse of encrypt() above. Ported from Amritara's decryptHash.js (which
 * does the equivalent with Node's `crypto`) — this runs client-side in
 * ConfirmStep.jsx (a "use client" component bundled for the browser by the
 * consuming Next.js app), so it's built on crypto-js/md5 (already deps of
 * this file) instead of Node's `crypto` module, which isn't available/
 * polyfilled in a browser bundle.
 */
export function decrypt(encryptedHex, key) {
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Hex.parse(encryptedHex),
  });
  return CryptoJS.AES.decrypt(cipherParams, deriveKey(key), {
    iv: fixedIv(),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);
}

/**
 * Decrypts STAAH's pay-later card-detail hash (`responseJson.hash_key`)
 * into a plain object — ported from Amritara's decryptFunction.js. The
 * decrypted payload is "||"-joined key=value pairs (e.g.
 * "card_name=...||card_type=...||card_exp=..."), same shape encryptHash()
 * above produces going the other direction.
 */
export function decryptHashFunction(partnerId, partnerKey, data) {
  const decrypted = decrypt(data, partnerKey);
  const result = {};
  decrypted.split("||").forEach((item) => {
    const [key, value] = item.split("=");
    if (key && value) result[key] = value;
  });
  return result;
}

export function redirectToPayment(paramvalues, keydata, staahBaseUrl) {
  const baseUrl = `${staahBaseUrl}/api/th-payment-redirect2`;
  console.log("[PAYMENT-FLOW] paymentHash.js: submitting hidden form to STAAH", { baseUrl, currentUrlBeforePush: window.location.href });
  // pushState, NOT replaceState — ported from real Amritara's DetailStep.js
  // (~1688-1696), which does the exact same push right before its own
  // redirectWithPost/form.submit(). A plain replaceState here overwrites the
  // checkout page's own history entry with this marker, so pressing the
  // browser Back button from STAAH's hosted page skips straight past it to
  // whatever came before — on this site, that's effectively the homepage.
  // pushState instead ADDS this marker on top of the checkout entry, so
  // Back lands ON it: same document, same React tree, restored from the
  // browser's bfcache with the guest's in-progress checkout state (form
  // data, selected room, step) fully intact — exactly how real Amritara's
  // desktop "back returns to the same page" behavior actually works (no
  // pageshow/visibilitychange trickery needed, confirmed absent there).
  // Keeps the CURRENT pathname (e.g. "/be-booking"), only swapping the
  // query string to the marker — a hardcoded "/?pay-now" changes the
  // pathname to the site root, and the host app's own header-hiding logic
  // (bawahotels-nextjs-new's ConditionalHeader) only hides the header on
  // paths starting with "/be-booking". Since pushState doesn't actually
  // unmount the wizard, that mismatch showed the site header rendering
  // again, overlapping the still-mounted booking wizard underneath it.
  //
  // APPENDS to the existing query string — does NOT replace it. This host
  // app's checkout page (be-booking/page.js's HydrateFromQueryParams) reads
  // propertyId/startDate/endDate/rooms straight off the URL to rebuild
  // SearchContext on mount; real Amritara doesn't have this problem because
  // its equivalent restores everything from sessionStorage instead of the
  // URL. Dropping those params here (a bare "?pay-now" discards the whole
  // existing search string) is exactly what left the guest on an empty
  // "Select a destination..." step 1 after coming back — Wizard.jsx's own
  // sessionStorage fallback correctly jumped the step to 4, but
  // HydrateFromQueryParams had nothing left to hydrate SearchContext with,
  // so ConfirmStep rendered on top of a property/date-less search state.
  const marker = new URLSearchParams(window.location.search);
  marker.set("pay-now", "1");
  window.history.pushState(
    {},
    "",
    `${window.location.pathname}?${marker.toString()}`,
  );

  const form = document.createElement("form");
  form.method = "POST";
  form.action = baseUrl;

  const input1 = document.createElement("input");
  input1.type = "hidden";
  input1.name = "paramvalues";
  input1.value = paramvalues;

  const input2 = document.createElement("input");
  input2.type = "hidden";
  input2.name = "keydata";
  input2.value = keydata;

  form.appendChild(input1);
  form.appendChild(input2);
  document.body.appendChild(form);
  console.log("[PAYMENT-FLOW] paymentHash.js: form.submit() called — browser should now navigate to STAAH");
  form.submit();
}
