"use client";

import { useState } from "react";
import { useConfig } from "../../config/configContext.js";
import { useBookingEngineAuth } from "../../context/AuthContext.js";
import "./LoyaltyUnlockModal.css";

/**
 * Bawa-hotels-next's "Loyalty Club" unlock modal — visual/UX ported 1:1
 * (tab selector, benefit box, single OTP text input styled with
 * letter-spacing to look like digit boxes) but wired to REAL OTP
 * verification via AuthContext instead of bawa's mock ("enter any 4 digits").
 * OTP length is config.otpLength (default 6), matching the real API's
 * validation instead of bawa's cosmetic 4-digit field.
 */
export function LoyaltyUnlockModal({ isOpen, onClose, onUnlocked, onDeclineStandardRate }) {
  const config = useConfig();
  const { requestOtp, loginWithOtp } = useBookingEngineAuth();
  const otpLength = config.otpLength ?? 6;

  const [otpMethod, setOtpMethod] = useState("email");
  const [identity, setIdentity] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const reset = () => {
    setOtpMethod("email");
    setIdentity("");
    setOtpValue("");
    setOtpSent(false);
    setIsVerifying(false);
    setIsSending(false);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setIsSending(true);
    try {
      const mobile = otpMethod === "mobile" ? identity : "";
      const email = otpMethod === "email" ? identity : "";
      const result = await requestOtp(mobile, email);
      if (result.ok) {
        setOtpSent(true);
      } else {
        setError(result.message || "Failed to send OTP");
      }
    } catch (err) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setIsVerifying(true);
    try {
      const mobile = otpMethod === "mobile" ? identity : "";
      const email = otpMethod === "email" ? identity : "";
      const { user } = await loginWithOtp(mobile, otpValue, email);
      onUnlocked?.(user);
      reset();
    } catch (err) {
      setError(err.message || "OTP verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="be-loyalty-overlay">
      <div className="be-loyalty-modal">
        <div className="be-loyalty-close" onClick={handleClose}>
          &times;
        </div>

        <div className="be-loyalty-header">
          <div className="be-loyalty-sparkle">✦</div>
          <h3>Loyalty Club</h3>
          <p className="be-loyalty-subtitle">Verify your details to instantly unlock member rates</p>
        </div>

        {!isVerifying && !otpSent && (
          <div className="be-loyalty-tabs">
            <button
              type="button"
              onClick={() => setOtpMethod("email")}
              className={`be-loyalty-tab ${otpMethod === "email" ? "be-loyalty-tab--active" : ""}`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setOtpMethod("mobile")}
              className={`be-loyalty-tab ${otpMethod === "mobile" ? "be-loyalty-tab--active" : ""}`}
            >
              Mobile
            </button>
          </div>
        )}

        <div className="be-loyalty-benefits">
          <div className="be-loyalty-benefit-item">
            <span className="be-loyalty-benefit-icon">✓</span>
            <span>Instant <strong>member discount</strong> on this booking</span>
          </div>
          <div className="be-loyalty-benefit-item">
            <span className="be-loyalty-benefit-icon">✓</span>
            <span>Early check-in &amp; welcome amenities</span>
          </div>
        </div>

        {error && <p className="be-loyalty-error">{error}</p>}

        {!otpSent ? (
          <form className="be-loyalty-form" onSubmit={handleSendOtp}>
            <div className="be-loyalty-form-group">
              <label htmlFor="be-loyalty-identity">{otpMethod === "email" ? "Email Address" : "Mobile Number"}</label>
              <input
                id="be-loyalty-identity"
                type={otpMethod === "email" ? "email" : "tel"}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder={otpMethod === "email" ? "you@example.com" : "+91 98765 43210"}
                required
                className="be-loyalty-input"
              />
            </div>
            <button type="submit" className="be-loyalty-submit-btn" disabled={isSending}>
              {isSending ? "Sending..." : "Send Verification OTP"}
            </button>
          </form>
        ) : (
          <form className="be-loyalty-form" onSubmit={handleVerifyOtp}>
            <p className="be-loyalty-otp-sent-info">
              We sent a {otpLength}-digit verification code to <strong>{identity}</strong>
            </p>
            <div className="be-loyalty-form-group" style={{ alignItems: "center" }}>
              <label>Enter {otpLength}-Digit OTP</label>
              <input
                type="text"
                inputMode="numeric"
                pattern={`[0-9]{${otpLength}}`}
                maxLength={otpLength}
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, otpLength))}
                placeholder={"•".repeat(otpLength)}
                required
                className="be-loyalty-input be-loyalty-otp-input"
              />
            </div>
            <button type="submit" className="be-loyalty-submit-btn" disabled={isVerifying || otpValue.length !== otpLength}>
              {isVerifying ? "Verifying..." : "Verify & Unlock Rate"}
            </button>
            <button type="button" onClick={() => setOtpSent(false)} className="be-loyalty-cancel-link">
              ← Edit Details
            </button>
          </form>
        )}

        {!isVerifying && (
          <div className="be-loyalty-footer">
            <button
              type="button"
              onClick={() => {
                onDeclineStandardRate?.();
                handleClose();
              }}
              className="be-loyalty-cancel-link"
            >
              No thanks, book Standard Rate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
