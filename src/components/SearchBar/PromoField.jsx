"use client";

export function PromoField({ value, onChange }) {
  return (
    <div className="be-form-group be-promo-group">
      <svg className="be-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
      <div className="be-form-field-inputs">
        <label>Promo Code</label>
        <input id="be-promo-input" type="text" placeholder="Optional" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
