// Which ways to book the selected hotel offers: Pay Now ("Pay & Confirm Booking" / "Confirm & Pay")
// and/or Pay Later.
//
// config.enablePayNow / config.enablePayLater: a boolean for every hotel, or a function
// ({ propertyId, propertyName }) => boolean to decide per hotel (propertyId is the search's selected
// property id, i.e. the hotel's staahPropertyId). Both default to true. If both come out false,
// Pay Later stays on so the guest can still book.
export function resolvePaymentOptions(config, property) {
  const resolve = (flag) => (typeof flag === "function" ? flag(property || {}) : flag) !== false;
  const payNow = resolve(config?.enablePayNow);
  const payLater = resolve(config?.enablePayLater) || !payNow;
  return { payNow, payLater };
}
