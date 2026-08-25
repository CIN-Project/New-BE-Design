"use client";

import { useState } from "react";
import { useConfig } from "../../config/configContext.js";
import { useCartContext } from "../../context/CartContext.js";
import { verifyPromoCode } from "../../api/rates.js";
import "./CartOverview.css";

/**
 * Promo-code reveal input, rendered inside the cart sidebar's "Stay & Guests"
 * section. Visual spec ported 1:1 from bawa-hotels-next (inline styles, no
 * reveal animation); wired to the real `verifyPromoCode` API — unlike
 * Amritara's dead placeholder CouponComponent.js (a static swiper of fake
 * coupon cards with an inert `href="#"` apply link and no verification
 * logic), this one actually verifies and applies.
 *
 * `isOpen`/`onClose` are controlled by CartOverview.jsx, which only mounts
 * this component once its own "Add Promocode" link is clicked. This used to
 * ALSO track its own separate `isOpen` state internally, gated behind its
 * own identical-looking "Add Promocode" label — meaning a guest had to
 * click "Add Promocode" once to mount this component (revealing its still-
 * closed inner label) and click it again to actually open the input. One
 * controlled toggle now, one click.
 */
export function CouponComponent({ isOpen, onClose }) {
  const config = useConfig();
  const { promoCodeContext, setPromoCodeContext, setPromoCodeCustomerContext } = useCartContext();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Mirrors what the user typed for the "Promo: {code}" success line —
  // promoCodeContext itself holds the base64-encoded value the rest of the
  // booking flow sends to the API, not a human-readable code.
  const [appliedCode, setAppliedCode] = useState("");

  const handleApply = async () => {
    const trimmed = code.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      const response = await verifyPromoCode(config, trimmed);

      if (response?.errorCode === "0") {
        const masterPromo = response?.data?.masterPromo;
        setPromoCodeCustomerContext(response?.data ?? response);
        // No client-side discount multiplier here on purpose: real Amritara
        // never applies one either (its own promoCodeDiscountMultiplier
        // field is dead — set to a default and never consumed by any price
        // calculation). Any real discount for this code is applied
        // server-side, baked into the rates StayStep re-fetches once
        // promoCodeContext changes below — inventing a client-side
        // percentage here would just be a fabricated number with no basis
        // in what the server actually returns.
        setPromoCodeContext(btoa(masterPromo || trimmed));
        setAppliedCode(trimmed);
        onClose?.();
        setCode("");
      } else {
        setError(response?.message || response?.data?.message || "This promo code is not valid.");
      }
    } catch (err) {
      setError(err?.message || "Could not verify promo code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = () => {
    setPromoCodeContext(null);
    setPromoCodeCustomerContext(null);
    setAppliedCode("");
  };

  if (promoCodeContext) {
    return (
      <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "0.75rem", color: "#27ae60", fontWeight: 700 }}>
          Promo: {appliedCode || "Applied"}
        </span>
        <span
          onClick={handleRemove}
          style={{ fontSize: "0.7rem", color: "#c0392b", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}
        >
          Remove
        </span>
      </div>
    );
  }

  // The "Add Promocode"/"Cancel Promo" toggle itself lives in
  // CartOverview.jsx, inline with "Modify Dates"/"Modify Guests" — it used
  // to also be duplicated here as this component's own label, which not
  // only required two clicks to actually open the input (see the isOpen/
  // onClose doc comment above) but also visually landed on its own line
  // below "Modify Dates | Modify Guests" instead of staying in that same
  // row once open. This component now only renders the input/apply/error
  // UI; opening and closing are entirely the parent's job.
  return (
    <div>
      {isOpen ? (
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter Code"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: "0.68rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
              height: "24px",
            }}
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={isSubmitting}
            style={{
              background: "var(--be-color-primary, #846836)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0 10px",
              fontSize: "0.65rem",
              fontWeight: 600,
              height: "24px",
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "..." : "Apply"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: "0.65rem", color: "#c0392b", marginTop: "4px" }}>{error}</div>
      ) : null}
    </div>
  );
}
