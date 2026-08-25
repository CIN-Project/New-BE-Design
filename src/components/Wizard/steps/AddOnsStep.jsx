"use client";

import { useEffect, useRef, useState } from "react";
import { useConfig } from "../../../config/configContext.js";
import { useCartContext } from "../../../context/CartContext.js";
import { useSearchContext } from "../../../context/SearchContext.js";
import { getAddOns } from "../../../api/rates.js";
import "./AddOnsStep.css";

function formatCurrency(value) {
  return `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
}

/** Pull `.INR[field]` out of a Rate/AdultRate/ChildRate array entry. */
function extractRateField(rateArray, field) {
  if (!rateArray || rateArray.length === 0) return null;
  const inr = rateArray.find((r) => r?.INR)?.INR;
  return inr && inr[field] != null ? Number(inr[field]) : null;
}

/** Primary (adult/flat) price, falling back Rate -> AdultRate -> ChildRate (mirrors Amritara's getNZDPrice). */
function getAddonAmount(addon) {
  return (
    extractRateField(addon?.Rate, "amountAfterTax") ??
    extractRateField(addon?.AdultRate, "amountAfterTax") ??
    extractRateField(addon?.ChildRate, "amountAfterTax") ??
    0
  );
}

/** Primary (adult/flat) tax component, same fallback order as getAddonAmount. */
function getAddonTax(addon) {
  return (
    extractRateField(addon?.Rate, "tax") ??
    extractRateField(addon?.AdultRate, "tax") ??
    extractRateField(addon?.ChildRate, "tax") ??
    0
  );
}

function getChildAmount(addon) {
  return extractRateField(addon?.ChildRate, "amountAfterTax") ?? 0;
}

function getChildTax(addon) {
  return extractRateField(addon?.ChildRate, "tax") ?? 0;
}

/**
 * Pricing rule (ported from Amritara's AddOnsStep.js/Filterbar.js): price x
 * quantity, multiplied by number-of-nights when Type === "R" (recurring) vs
 * charged once when Type === "O" (one-off); multiplied by adult+child count
 * when Applicable === "G" (per-guest, split by AdultRate/ChildRate) vs a flat
 * charge when Applicable is "D" or "Q".
 */
function computeAddonCharge(addon, { adults, children, numberOfDays }) {
  const adultAmount = getAddonAmount(addon);
  const adultTax = getAddonTax(addon);
  const childAmount = getChildAmount(addon);
  const childTax = getChildTax(addon);

  let amount;
  let taxAmount;

  if (addon?.Applicable === "G") {
    amount = adultAmount * adults + childAmount * children;
    taxAmount = adultTax * adults + childTax * children;
  } else {
    // "D" or "Q" — flat charge, not multiplied by guest count.
    amount = adultAmount;
    taxAmount = adultTax;
  }

  if (addon?.Type === "R") {
    amount *= numberOfDays;
    taxAmount *= numberOfDays;
  }

  return { amount, taxAmount };
}

function calculateNumberOfDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}

/**
 * Add-ons carousel. Visual/scroller spec ported 1:1 from bawa-hotels-next
 * (plain overflow-x scroller with scroll-snap, no carousel library); pricing
 * logic ported from Amritara_New_NextJs's AddOnsStep.js/Filterbar.js, wired
 * to the flat (non-per-room) selectedAddOns list this package's CartContext
 * uses.
 */
export function AddOnsStep() {
  const config = useConfig();
  const {
    selectedAddOns,
    setSelectedAddOns,
    addonList,
    setAddonList,
    setAddonAmountTotal,
    setAddonTaxTotal,
  } = useCartContext();
  const { selectedPropertyId, selectedStartDate, selectedEndDate, searchRooms } = useSearchContext();

  const [isLoading, setIsLoading] = useState(false);
  const carouselRef = useRef(null);

  const numberOfDays = calculateNumberOfDays(selectedStartDate, selectedEndDate);
  const totalAdults = (searchRooms || []).reduce((sum, r) => sum + (r.adults || 0), 0);
  const totalChildren = (searchRooms || []).reduce((sum, r) => sum + (r.children || 0), 0);

  useEffect(() => {
    if (addonList && addonList.length > 0) return;
    if (!selectedPropertyId) return;

    let cancelled = false;
    setIsLoading(true);
    getAddOns(config, selectedPropertyId)
      .then((data) => {
        if (cancelled) return;
        setAddonList(data?.[0]?.ExtrasData || []);
      })
      .catch((err) => {
        console.error("[booking-engine-new] Failed to load add-ons", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  // Recompute cart-level add-on totals every time the selection (or the
  // guest/night counts it depends on) changes.
  useEffect(() => {
    const totals = (selectedAddOns || []).reduce(
      (acc, addon) => {
        const { amount, taxAmount } = computeAddonCharge(addon, {
          adults: totalAdults,
          children: totalChildren,
          numberOfDays,
        });
        return { amount: acc.amount + amount, tax: acc.tax + taxAmount };
      },
      { amount: 0, tax: 0 }
    );
    setAddonAmountTotal(totals.amount);
    setAddonTaxTotal(totals.tax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddOns, totalAdults, totalChildren, numberOfDays]);

  const isSelected = (addonId) => (selectedAddOns || []).some((a) => a.AddonId === addonId);

  const toggleAddon = (addon) => {
    if (isSelected(addon.AddonId)) {
      setSelectedAddOns((selectedAddOns || []).filter((a) => a.AddonId !== addon.AddonId));
    } else {
      const quantity = addon.Applicable === "G" ? totalAdults + totalChildren || 1 : 1;
      setSelectedAddOns([...(selectedAddOns || []), { ...addon, quantity }]);
    }
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
      </div>

      {isLoading ? (
        <p className="addons-loading-text">Loading add-ons…</p>
      ) : (
        <div className="addons-carousel-container">
          <div className="addons-carousel" ref={carouselRef}>
            {addonList.map((addon) => {
              const selected = isSelected(addon.AddonId);
              const price = getAddonAmount(addon);

              return (
                <div
                  key={addon.AddonId}
                  className={`addon-card ${selected ? "selected" : ""}`}
                  onClick={() => toggleAddon(addon)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="addon-image-wrap">
                    <img
                      className="addon-image"
                      src={addon.Image || "/no_image.jpg"}
                      alt={addon.AddonName || "Add-on"}
                    />
                    <div className="addon-card-checkbox-overlay">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                  <div className="addon-content">
                    <div className="addon-card-name">{addon.AddonName}</div>
                    {addon.Description ? <div className="addon-card-desc">{addon.Description}</div> : null}
                    <div className="addon-card-footer">
                      <span className="addon-card-price">+{formatCurrency(price)}</span>
                      <span className="addon-select-indicator">{selected ? "✓ Selected" : "+ Add"}</span>
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
