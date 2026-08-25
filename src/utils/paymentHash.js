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

export function redirectToPayment(paramvalues, keydata, staahBaseUrl) {
  const baseUrl = `${staahBaseUrl}/api/th-payment-redirect`;
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
  form.submit();
}
