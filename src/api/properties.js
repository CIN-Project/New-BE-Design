import { cmsGet } from "./client.js";

/**
 * Look up properties grouped by city — the destination dropdown's real data
 * source (confirmed live at Amritara_New_NextJs/src/app/layout.js:65-106).
 * Pass a `cityId` to filter to one city, or omit it to fetch every city with
 * its properties in one call (real Amritara's own root layout calls it with
 * no CityId at all to build its site-wide dropdown).
 */
export function getCityWithProperty(config, cityId) {
  const query = cityId != null ? `?CityId=${parseInt(cityId, 10)}` : "";
  return cmsGet(
    config,
    "cmsBaseUrl",
    `/property/GetCityWithProperty${query}`,
  );
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
