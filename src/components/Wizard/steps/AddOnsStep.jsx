"use client";

import { useEffect, useRef, useState } from "react";
import { useConfig } from "../../../config/configContext.js";
import { useCartContext } from "../../../context/CartContext.js";
import { useSearchContext } from "../../../context/SearchContext.js";
import { useStayContext } from "../../../context/StayContext.js";
import { getAddOns } from "../../../api/rates.js";
import { postBookingWidged } from "../../../api/tracking.js";
import {
  addonDisplayPrice,
  addonMaxQuantity,
  addonPriceUnit,
  addonStayCharge,
} from "../../../utils/addonPricing.js";
import "./AddOnsStep.css";

function formatCurrency(value) {
  return `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function calculateNumberOfDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}

/**
 * Add-ons carousel, shown under the guest details form when config.enableAddOns is true.
 * Visual/scroller spec ported from bawa-hotels-next (plain overflow-x scroller with scroll-snap, no
 * carousel library); selection and pricing as on Amritara_New_NextJs's AddOnsStep.js: add-ons are
 * chosen per room (Room 1 / Room 2 tabs) with a quantity, and priced with that room's own guests
 * (utils/addonPricing.js, shared with DetailStep's booking payload).
 *
 * selectedAddOns holds one entry per room and add-on: { ...addon, roomIndex, quantity }.
 * addonAmountTotal / addonTaxTotal hold the pre-tax amount and the tax separately, like a room's
 * base and tax, since the cart total adds the two.
 */
export function AddOnsStep() {
  const config = useConfig();
  const {
    selectedAddOns,
    setSelectedAddOns,
    addonList,
    setAddonList,
    addonPropertyId,
    setAddonPropertyId,
    setAddonAmountTotal,
    setAddonTaxTotal,
  } = useCartContext();
  const { selectedPropertyId, selectedStartDate, selectedEndDate, searchRooms } = useSearchContext();
  const { selectedRoom } = useStayContext();

  const [isLoading, setIsLoading] = useState(false);
  const [activeRoom, setActiveRoom] = useState(0);
  const carouselRef = useRef(null);

  const numberOfDays = calculateNumberOfDays(selectedStartDate, selectedEndDate);
  const rooms = searchRooms?.length ? searchRooms : [{ adults: 1, children: 0 }];
  const roomIndex = Math.min(activeRoom, rooms.length - 1);
  const chosen = selectedAddOns || [];

  // Load the hotel's add-ons. The list is kept in the cart with the hotel it belongs to, so it is
  // fetched once per hotel, and a guest who goes back and picks another hotel doesn't see (or keep)
  // the previous hotel's add-ons.
  useEffect(() => {
    if (!selectedPropertyId || addonPropertyId === selectedPropertyId) return;
    if (addonPropertyId != null) {
      setAddonList([]);
      setSelectedAddOns([]);
    }
    setAddonPropertyId(selectedPropertyId);

    let cancelled = false;
    let settled = false;
    setIsLoading(true);
    // Ported from Filterbar.js's fetchAddOns (~2103-2173) — beacon fired
    // once the add-ons fetch settles, success or failure (real Amritara
    // fires this once, in its finally block, not on entry too).
    getAddOns(config, selectedPropertyId)
      .then((data) => {
        if (cancelled) return;
        // In the order the hotel set in STAAH (Priority 1 first).
        const extras = [...(data?.[0]?.ExtrasData || [])].sort(
          (a, b) => (a?.Priority ?? Infinity) - (b?.Priority ?? Infinity),
        );
        setAddonList(extras);
        postBookingWidged(config, {
          ctaName: "Fetch AddOns",
          propertyId: selectedPropertyId,
          apiName: "add-ons",
          apiUrl: `${config?.staahBaseUrl || ""}/api/cin-api/add-ons`,
          apiStatus: extras.length > 0 ? "Success" : "Data not found",
          apiMessage: extras.length > 0 ? "Success" : "Data not found",
        });
      })
      .catch((err) => {
        console.error("[booking-engine-new] Failed to load add-ons", err);
        // Try again next time the step shows.
        setAddonPropertyId(null);
        postBookingWidged(config, {
          ctaName: "Fetch AddOns",
          propertyId: selectedPropertyId,
          apiName: "add-ons",
          apiUrl: `${config?.staahBaseUrl || ""}/api/cin-api/add-ons`,
          apiStatus: err?.message || "Error",
          apiErrorCode: "1166",
          apiMessage: err?.message || "Error",
        });
      })
      .finally(() => {
        settled = true;
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      // Left the step before the list arrived: fetch it again next time.
      if (!settled) setAddonPropertyId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  // Recompute the cart's add-on totals whenever the selection (or the
  // guest/night counts it depends on) changes. Add-ons for a room the guest
  // has since removed from the search are dropped.
  useEffect(() => {
    const kept = chosen.filter((addon) => (addon.roomIndex ?? 0) < rooms.length);
    if (kept.length !== chosen.length) {
      setSelectedAddOns(kept);
      return;
    }
    const totals = kept.reduce(
      (acc, addon) => {
        const room = rooms[addon.roomIndex ?? 0] || {};
        const { amount, tax } = addonStayCharge(addon, {
          adults: room.adults ?? 1,
          children: room.children ?? 0,
          nights: numberOfDays,
        });
        return { amount: acc.amount + amount, tax: acc.tax + tax };
      },
      { amount: 0, tax: 0 },
    );
    setAddonAmountTotal(totals.amount);
    setAddonTaxTotal(totals.tax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddOns, searchRooms, numberOfDays]);

  const quantityOf = (addon) =>
    chosen.find((a) => (a.roomIndex ?? 0) === roomIndex && a.AddonId === addon.AddonId)?.quantity || 0;

  const setQuantity = (addon, quantity) => {
    const others = chosen.filter((a) => !((a.roomIndex ?? 0) === roomIndex && a.AddonId === addon.AddonId));
    const next = Math.max(0, Math.min(addonMaxQuantity(addon), quantity));
    setSelectedAddOns(next > 0 ? [...others, { ...addon, roomIndex, quantity: next }] : others);
  };

  const scrollByCard = (direction) => {
    const el = carouselRef.current;
    if (!el) return;
    const card = el.querySelector(".addon-card");
    const cardWidth = card ? card.clientWidth : 260;
    el.scrollBy({ left: direction * (cardWidth + 14), behavior: "smooth" });
  };

  if (!isLoading && (!addonList || addonList.length === 0)) {
    return null;
  }

  return (
    <div className="be-addons-step">
      <div className="addons-step-header">
        <h3 className="addons-step-title">Enhance Your Stay (Add-ons)</h3>
        {!isLoading && addonList.length > 1 ? (
          <div className="addons-header-actions">
            <button
              type="button"
              className="carousel-arrow-btn"
              onClick={() => scrollByCard(-1)}
              aria-label="Scroll add-ons left"
            >
              &#8249;
            </button>
            <button
              type="button"
              className="carousel-arrow-btn"
              onClick={() => scrollByCard(1)}
              aria-label="Scroll add-ons right"
            >
              &#8250;
            </button>
          </div>
        ) : null}
      </div>

      {rooms.length > 1 ? (
        <div className="addons-room-tabs" role="tablist" aria-label="Choose add-ons for">
          {rooms.map((_, index) => {
            const count = chosen
              .filter((a) => (a.roomIndex ?? 0) === index)
              .reduce((sum, a) => sum + (a.quantity || 0), 0);
            return (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === roomIndex}
                className={`addons-room-tab ${index === roomIndex ? "active" : ""}`}
                title={selectedRoom?.[index]?.roomName || undefined}
                onClick={() => setActiveRoom(index)}
              >
                Room {index + 1}
                {count > 0 ? <span className="addons-room-tab-count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {isLoading ? (
        <p className="addons-loading-text">Loading add-ons…</p>
      ) : (
        <div className="addons-carousel-container">
          <div className="addons-carousel" ref={carouselRef}>
            {addonList.map((addon) => {
              const quantity = quantityOf(addon);
              const maxQuantity = addonMaxQuantity(addon);
              const unit = addonPriceUnit(addon);
              // STAAH sends the text as AddonDescription.
              const description = addon.AddonDescription || addon.Description;

              return (
                <div key={addon.AddonId} className={`addon-card ${quantity > 0 ? "selected" : ""}`}>
                  <div className="addon-image-wrap">
                    <img
                      className="addon-image"
                      src={addon.Image || "/no_image.jpg"}
                      alt={addon.ImageLabel || addon.AddonName || "Add-on"}
                    />
                    <div className="addon-card-checkbox-overlay">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                  <div className="addon-content">
                    <div className="addon-card-name">{addon.AddonName}</div>
                    {description ? <div className="addon-card-desc">{description}</div> : null}
                    <div className="addon-card-footer">
                      <span className="addon-card-price">
                        +{formatCurrency(addonDisplayPrice(addon))}
                        {unit ? <span className="addon-card-price-unit"> / {unit}</span> : null}
                      </span>
                      {quantity === 0 ? (
                        <button type="button" className="addon-select-indicator" onClick={() => setQuantity(addon, 1)}>
                          + Add
                        </button>
                      ) : maxQuantity === 1 ? (
                        <button
                          type="button"
                          className="addon-select-indicator"
                          onClick={() => setQuantity(addon, 0)}
                          aria-label={`Remove ${addon.AddonName || "add-on"}`}
                        >
                          ✓ Added
                        </button>
                      ) : (
                        <div className="addon-qty">
                          <button
                            type="button"
                            onClick={() => setQuantity(addon, quantity - 1)}
                            aria-label={`One less ${addon.AddonName || "add-on"}`}
                          >
                            −
                          </button>
                          <span>{quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQuantity(addon, quantity + 1)}
                            disabled={quantity >= maxQuantity}
                            aria-label={`One more ${addon.AddonName || "add-on"}`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
