import CryptoJS from "crypto-js";
import md5 from "md5";

export function encrypt(plainText, key) {
  const keyHex = CryptoJS.enc.Hex.parse(md5(key));
  const iv = CryptoJS.lib.WordArray.create(
    [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f],
    16
  );
  return CryptoJS.AES.encrypt(plainText, keyHex, {
    iv,
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
 * Inverse of encrypt() above — same MD5(key)-derived key + fixed IV,
 * AES-128-CBC. Ported from Amritara's decryptHash.js, which does the
 * equivalent with Node's `crypto` (server-side); this runs client-side in
 * ConfirmStep.jsx so it's built on crypto-js/md5 instead (already deps of
 * this file) rather than Node's crypto module.
 */
export function decrypt(encryptedHex, key) {
  const keyHex = CryptoJS.enc.Hex.parse(md5(key));
  const iv = CryptoJS.lib.WordArray.create(
    [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f],
    16
  );
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Hex.parse(encryptedHex),
  });
  return CryptoJS.AES.decrypt(cipherParams, keyHex, {
    iv,
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
  console.log("[PAYMENT-FLOW] paymentHash.js: submitting hidden form to STAAH", { baseUrl, currentUrlBeforeReplace: window.location.href });
  window.history.replaceState({}, "", "/?pay-now");

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
