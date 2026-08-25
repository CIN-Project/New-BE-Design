"use client";

import "./StepIndicator.css";

/**
 * 2-node progress bar (Select Room & Package / Guest Details & Checkout).
 * Faithful to bawa-hotels-next: confirmation (step 4) doesn't get its own
 * node — the indicator is just hidden there.
 */
export function StepIndicator({ step, onBack }) {
  if (step >= 4) return null;

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: step === 1 ? "1rem auto 1.5rem" : "0.5rem auto 1.5rem",
        padding: "0 0rem",
        width: "100%",
      }}
    >
      {step === 2 && (
        <div style={{ marginBottom: "0.8rem" }}>
          <button
            type="button"
            onClick={onBack}
            className="be-back-to-rooms-btn"
          >
            ← Back to Rooms
          </button>
        </div>
      )}
      <div className="be-step-indicator">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            maxWidth: 600,
            margin: "0 auto",
            position: "relative",
          }}
        >
          <div className="be-step-connector-line" />
          <div
            className={`be-step-item ${step === 1 ? "be-step-item--active" : ""} ${step > 1 ? "be-step-item--completed" : ""}`}
            style={{ zIndex: 2 }}
          >
            <span className="be-step-num">{step > 1 ? "✓" : "1"}</span>
            <span className="be-step-label">Select Room &amp; Package</span>
          </div>
          <div
            className={`be-step-item ${step >= 2 ? "be-step-item--active" : ""}`}
            style={{ zIndex: 2 }}
          >
            <span className="be-step-num">2</span>
            <span className="be-step-label">Guest Details &amp; Checkout</span>
          </div>
        </div>
      </div>
    </div>
  );
}
