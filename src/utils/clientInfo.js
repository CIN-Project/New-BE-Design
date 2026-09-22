/**
 * Port of real Amritara's getUserInfo() (src/utilities/userInfo.js) — public
 * IP + coarse device classification for postBookingWidged's `ip`/
 * `deviceName`/`deviceType` fields (see tracking.js). Split into two pieces
 * here rather than one bundled async call:
 *
 * - getDeviceInfo() is synchronous (navigator.userAgent is already
 *   available, no network round-trip needed) and mirrors real's exact
 *   regex/branch logic so `deviceName`/`deviceType` values match real's
 *   output verbatim (Desktop/Mobile/Tablet, and Android/iOS/Unknown->
 *   platform-fallback).
 * - getCachedPublicIp() fetches api64.ipify.org, same as real, but caches
 *   the in-flight/resolved promise at module scope instead of real's
 *   behavior of calling it fresh on every single postBookingWidged call
 *   (~45 touchpoints per booking attempt in real). The IP doesn't change
 *   within a tab's lifetime, so re-fetching it per-beacon is pure waste and
 *   risk (ipify rate-limiting a guest's own booking flow); every beacon
 *   still ends up with the same real IP value, just fetched once.
 */
let cachedIpPromise = null;

export function getDeviceInfo() {
  if (typeof navigator === "undefined") {
    return { deviceName: "Desktop", deviceType: "Unknown" };
  }
  const ua = navigator.userAgent || "";
  let deviceName = "Desktop";
  let deviceOS = "Unknown";

  if (/Tablet|iPad/i.test(ua)) {
    deviceName = "Tablet";
    deviceOS = /iPad|iPhone|iPod/.test(ua) ? "iOS" : "Android";
  } else if (/Mobi|Android/i.test(ua)) {
    deviceName = "Mobile";
    if (/Android/i.test(ua)) {
      deviceOS = "Android";
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      deviceOS = "iOS";
    }
  }

  const platform = navigator.platform || "";
  return {
    deviceName,
    // Real: `deviceType = deviceOS === "Unknown" ? platform : deviceOS`.
    deviceType: deviceOS === "Unknown" ? platform : deviceOS,
  };
}

export function getCachedPublicIp() {
  if (typeof window === "undefined") return Promise.resolve("");
  if (!cachedIpPromise) {
    cachedIpPromise = fetch("https://api64.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => data?.ip || "")
      .catch(() => "");
  }
  return cachedIpPromise;
}
