"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./Modal.css";

/**
 * Generic centered modal shell (backdrop + white box + close button +
 * optional title/subtitle header). Used for the cart sidebar's "Modify
 * Dates"/"Modify Guests" popups — same chrome as StayStep.jsx's
 * RoomDetailsModal, factored out since this one needs a title/subtitle
 * header row those callers don't.
 *
 * Rendered via a portal to document.body rather than inline: this modal is
 * mounted from inside CartOverview.jsx's `.cart-sidebar`, which is
 * `position: sticky` — sticky unconditionally creates a new stacking
 * context (per spec), which traps a nested `position: fixed` descendant's
 * paint order relative to the rest of the page instead of letting it sit
 * reliably above everything. Real Amritara's own CartOverview.js hits this
 * same problem and portals its modal to document.body for exactly this
 * reason — matched here rather than re-discovering it differently.
 */
export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 640 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="be-modal-backdrop" onClick={onClose}>
      <div className="be-modal-box" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="be-modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {(title || subtitle) && (
          <div className="be-modal-header">
            {title && <h3 className="be-modal-title">{title}</h3>}
            {subtitle && <p className="be-modal-subtitle">{subtitle}</p>}
          </div>
        )}

        <div className="be-modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
}
