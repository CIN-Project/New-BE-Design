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
        {/* size keeps this input's own intrinsic (max-content) width down to
            roughly a real promo code's length — SearchBar.css now sizes its
            grid column to max-content so Location/Travelers can claim the
            leftover space, which only works if this doesn't default to the
            browser's much wider UA text-input size. width:100% (shared
            value-display rule) still makes it fill whatever that column
            ends up being once laid out. */}
        <input id="be-promo-input" type="text" size="10" placeholder="Optional" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
