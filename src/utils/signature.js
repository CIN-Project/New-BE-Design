export function createSignature(payload, timestamp, secret) {
  const data = JSON.stringify(payload) + timestamp;
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const msg = encoder.encode(data);

  return crypto.subtle
    .importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) => crypto.subtle.sign("HMAC", cryptoKey, msg))
    .then((signatureBuffer) =>
      Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
}

export async function signedHeaders(payload, secret) {
  const timestamp = Date.now().toString();
  const signature = await createSignature(payload, timestamp, secret);
  return {
    "Content-Type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}
