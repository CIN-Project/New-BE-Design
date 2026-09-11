import { cmsGet } from "./client.js";

// Bawa's own CMS data — see getCityWithProperty's `config.useHotelsListApi`
// doc comment below. Lives here, not in the consumer's config, because the
// consumer only needs to flip a switch; the URL itself is a fixed detail of
// *this* fallback path, not something a consumer should have to know or
// pass in.
//
// Relative, not the external `https://bawacmsnew.cinuniverse.com/api/cms`
// CMS URL directly — this code runs in the browser (properties.js's caller
// chain is all "use client"), and a browser-side cross-origin request to
// that CMS hits CORS (it was never configured to allow being called
// directly from a browser; the CMS was only ever reached server-side,
// where CORS doesn't apply, via bawahotels-nextjs-new's own /api/cms proxy
// route). A relative path resolves against whatever origin the page
// hosting this component is actually on, so it transparently hits that
// same proxy route instead — same-origin, no CORS — which then does the
// exact same external fetch, just server-side. Only works when this
// package is embedded in an app that actually has a route at /api/cms
// (true for bawahotels-nextjs-new, the only consumer this flag exists
// for), same assumption useHotelsListApi already carries.
const HOTELS_LIST_API_URL = "/api/cms";

/**
 * Look up properties grouped by city — the destination dropdown's real data
 * source (confirmed live at Amritara_New_NextJs/src/app/layout.js:65-106).
 * Pass a `cityId` to filter to one city, or omit it to fetch every city with
 * its properties in one call (real Amritara's own root layout calls it with
 * no CityId at all to build its site-wide dropdown).
 *
 * `config.useHotelsListApi`: an escape hatch for a consumer with no real
 * STAAH-integrated CMS of its own (e.g. bawahotels-nextjs-new — see
 * newEngineConfig.js's own doc comment on why it borrows Amritara's backend
 * at all today). When true, fetches HOTELS_LIST_API_URL above instead of
 * `cmsBaseUrl`'s GetCityWithProperty — expected to return a Next.js-style
 * `{ hotelsList: [{ id, name, city, slug, staahPropertyId, CINPropertyId,
 * ... }] }` shape (bawahotels-nextjs-new's own live /api/cms shape —
 * confirmed live: every entry actually does carry a real, distinct numeric
 * `staahPropertyId`, e.g. 691/746/756/54500/690/24454 across its 6 hotels,
 * despite that project's *local* db.json fallback mock not having one),
 * reshaped below into the CMS's own `{ data: [{ cityName, cityId,
 * propertyData }] }` shape before being returned, so
 * mapCityWithPropertyResponse and every caller downstream work identically
 * regardless of which source is active — nothing past this function needs
 * to know or care which one ran.
 */
export async function getCityWithProperty(config, cityId) {
  if (config?.useHotelsListApi) {
    const res = await fetch(HOTELS_LIST_API_URL);
    if (!res.ok) {
      throw new Error(
        `useHotelsListApi request failed: ${HOTELS_LIST_API_URL} (${res.status})`,
      );
    }
    const json = await res.json();
    // json.hotels (bawahotels-nextjs-new's own db.json shape: an object
    // keyed by hotel id, e.g. hotels.airport.contact = { phone, email,
    // address }) carries each property's own contact/address details —
    // present in the SAME /api/cms response but on a completely different
    // top-level key than hotelsList, so it was never actually reaching
    // mapHotelsListToCityWithPropertyShape below despite being right there
    // in `json` the whole time.
    return mapHotelsListToCityWithPropertyShape(
      json?.hotelsList || [],
      cityId,
      json?.hotels || {},
    );
  }

  const query = cityId != null ? `?CityId=${parseInt(cityId, 10)}` : "";
  return cmsGet(
    config,
    "cmsBaseUrl",
    `/property/GetCityWithProperty${query}`,
  );
}

/**
 * This consumer's own CMS (both its live bawacmsnew.cinuniverse.com backend
 * AND its local db.json fallback — confirmed identical, fetched directly)
 * only ever carries ONE combined address string per property
 * (hotels[id].contact.address), unlike real Amritara's own CMS, whose
 * property records carry AddressLine/City/State/PostalCode as genuinely
 * separate fields already. Every one of this consumer's 6 real hotel
 * addresses follows the exact same "<street/area details>, <City>,
 * <State> - <6-digit PIN>[.]" pattern (verified directly against the live
 * CMS response, not guessed), so this recovers the same three fields from
 * it instead of leaving them unpopulated. Returns `{ addressLine: original
 * string, city: null, state: null, postalCode: null }` unchanged if a given
 * address ever doesn't match that pattern, rather than mis-splitting it.
 */
function parseIndianAddress(address) {
  const fallback = { addressLine: address || null, city: null, state: null, postalCode: null };
  if (!address) return fallback;
  const match = String(address)
    .trim()
    .match(/^(.*?),\s*([A-Za-z .]+),\s*([A-Za-z .]+)\s*-\s*(\d{6})\.?\s*$/);
  if (!match) return fallback;
  return {
    addressLine: match[1].trim(),
    city: match[2].trim(),
    state: match[3].trim(),
    postalCode: match[4],
  };
}

/**
 * `propertyId` maps to `CINPropertyId` (the CMS's own internal id — same
 * role Amritara's plain `propertyId`/`CMSPropertyId` split plays, see
 * mapCityWithPropertyResponse's doc comment), falling back to the hotel's
 * `id` slug only if a hotel is ever missing one. `staahPropertyId`/
 * `staahBookingId` both map to the hotel's real `staahPropertyId` — this
 * data has no separate booking-specific id, so both point at the same real
 * value rather than one of them being a fabricated placeholder.
 */
function mapHotelsListToCityWithPropertyShape(hotelsList, cityId, hotelsById = {}) {
  const groups = new Map();
  for (const hotel of hotelsList) {
    const key = hotel.city || "other";
    if (!groups.has(key)) {
      groups.set(key, { cityId: key, cityName: key, propertyData: [] });
    }
    const contact = hotelsById[hotel.id]?.contact;
    const parsedAddress = parseIndianAddress(contact?.address);
    groups.get(key).propertyData.push({
      propertyId: hotel.CINPropertyId ?? hotel.id,
      propertyName: hotel.name,
      propertySlug: hotel.slug,
      staahPropertyId: hotel.staahPropertyId ?? hotel.id,
      staahBookingId: hotel.staahPropertyId ?? hotel.id,
      // Left `undefined` (not coerced to false) when the source hotel record
      // has no isDayUse field at all — DestinationField's day-use filter
      // only excludes a property on an explicit `false`, so a consumer
      // without this field (any GetCityWithProperty-backed one, not just
      // this useHotelsListApi fallback) still shows every property
      // regardless of the guest's day-use toggle, same as before this flag
      // existed.
      isDayUse: hotel.isDayUse == null ? undefined : Boolean(hotel.isDayUse),
      phone: contact?.phone || null,
      email: contact?.email || null,
      addressLine: parsedAddress.addressLine,
      city: parsedAddress.city,
      state: parsedAddress.state,
      postalCode: parsedAddress.postalCode,
    });
  }
  const cities = [...groups.values()];
  const filtered = cityId != null ? cities.filter((c) => c.cityId === cityId) : cities;
  return { data: filtered };
}

/**
 * Flatten a getCityWithProperty response (`{ data: [{ cityName, cityId,
 * propertyData: [{ propertyId, propertyName, ... }] }] }`) into the flat
 * property list `config.properties`/`DestinationField` expect — kept in
 * Amritara's own real field names/shape (matches layout.js:96-106) rather
 * than renamed, on purpose: `propertyId`, `propertyName`, `propertySlug`,
 * `staahPropertyId`, `staahBookingId`, `cityName`, `cityId`.
 *
 * `staahPropertyId` — NOT `propertyId` — is the id every rate/room/calendar
 * API call actually needs. Confirmed at Filterbar.js's `getPropertyOption`
 * (~358-366: `value: property?.staahPropertyId`) and its `handleCitySelectChange`
 * fetch fallback (~2313-2317: same `value = property?.staahPropertyId`
 * pattern) — `value` is what ends up in `selectedPropertyId`/`fetchContentApi`/
 * `fetchRatePrices`, i.e. every STAAH-signed and CMS content call. Plain
 * `propertyId` (the CMS's own internal id) is tracked separately in
 * Filterbar.js as `CMSPropertyId`, for unrelated CMS-only purposes — this
 * package doesn't have an equivalent use for it, but keeps the field present
 * on each property object for parity/future use.
 */
export function mapCityWithPropertyResponse(data) {
  const cities = Array.isArray(data?.data) ? data.data : [];

  return cities.flatMap((city) =>
    (city.propertyData || []).map((property) => ({
      propertyId: property.propertyId,
      propertyName: property.propertyName,
      propertySlug: property.propertySlug,
      staahPropertyId: property.staahPropertyId,
      staahBookingId: property.staahBookingId,
      cityName: city.cityName,
      cityId: city.cityId,
      isDayUse: property.isDayUse == null ? undefined : Boolean(property.isDayUse),
      // useHotelsListApi's own mapHotelsListToCityWithPropertyShape sets
      // these lowercase (phone/email/addressLine); a real STAAH CMS
      // GetCityWithProperty response hasn't been confirmed to carry these
      // at all on propertyData, so the PascalCase fallbacks here are a
      // best-effort guess at that source's likely naming, not a verified
      // shape — `null` either way is what a consumer already coped with
      // before (DetailStep.jsx's `Address: { Phone: selectedPropertyPhone }`
      // is used as-is regardless of a missing value).
      phone: property.phone ?? property.Phone ?? null,
      email: property.email ?? property.Email ?? null,
      addressLine:
        property.addressLine ?? property.AddressLine ?? property.Address ?? null,
      city: property.city ?? property.City ?? null,
      state: property.state ?? property.State ?? null,
      postalCode: property.postalCode ?? property.PostalCode ?? null,
    })),
  );
}

/**
 * Fetch the photo gallery for a property.
 */
export function getGalleryByProperty(config, propertyId) {
  return cmsGet(
    config,
    "cmsBaseUrl",
    `/gallery/GetGalleryByProperty?propertyId=${parseInt(propertyId, 10)}`,
  );
}
