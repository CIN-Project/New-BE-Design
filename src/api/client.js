import axios from "axios";
import { requireConfig } from "../config/configContext.js";
import { signedHeaders } from "../utils/signature.js";

export function createRateSearchClient(config) {
  const apiKey = requireConfig(config, "apiKeyGetRate", "room/rate search");
  return axios.create({
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    timeout: 15000,
  });
}

/**
 * Faithfully mirrors a real (if narrow) quirk of Amritara's STAAH signing:
 * the signature is NOT computed over the request body — it's computed over
 * a single identifying value (the property id, or the respTokenKey for
 * verify-token), confirmed at every real call site (Filterbar.js ~1562-1566
 * respTokenKey, ~1657-1661 propertyId, ~2022-2026 selectedPropertyId;
 * Flatpicker.js ~162 propertyId). `signaturePayload` must be that raw value
 * (e.g. `String(propertyId)`) — callers in rates.js supply it explicitly per
 * endpoint rather than this function guessing it from the body.
 */
export async function staahSignedRequest(
  config,
  path,
  body,
  { method = "POST", signaturePayload } = {},
) {
  const staahBaseUrl = requireConfig(config, "staahBaseUrl", "STAAH API calls");
  const secret = requireConfig(
    config,
    "staahSignatureSecret",
    "STAAH API calls",
  );
  const headers = await signedHeaders(signaturePayload, secret);

  const res = await fetch(`${staahBaseUrl}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const err = new Error(`STAAH request failed: ${path} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function cmsGet(config, key, path) {
  const base = requireConfig(config, key, `CMS request ${path}`);
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    const err = new Error(`CMS request failed: ${path} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function cmsPost(config, key, path, body) {
  const base = requireConfig(config, key, `CMS request ${path}`);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = new Error(`CMS request failed: ${path} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
