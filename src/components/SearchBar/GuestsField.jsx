"use client";

import { GuestsPicker } from "./GuestsPicker.js";

export function GuestsField({
  rooms,
  summaryText,
  onAddRoom,
  onRemoveRoom,
  onUpdateGuests,
  isOpen,
  onToggle,
  onDone,
  modalRef,
  openUpwards,
}) {
  return (
    <div className="be-form-group be-guests-group" style={{ position: "relative" }}>
      <svg className="be-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <div className="be-form-field-inputs" id="be-guests-trigger" onClick={onToggle}>
        <label>Travelers</label>
        <div className="be-custom-guests-display">{summaryText}</div>
      </div>

      {isOpen && (
        <div ref={modalRef} className={`be-travelers-modal be-modal-anim ${openUpwards ? "be-modal--open-up" : ""}`}>
          <GuestsPicker rooms={rooms} onAddRoom={onAddRoom} onRemoveRoom={onRemoveRoom} onUpdateGuests={onUpdateGuests} />
          <div className="be-modal-footer">
            <button type="button" className="be-btn-done" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
