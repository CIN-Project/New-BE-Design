"use client";

import "./SearchBar.css";

/**
 * The per-room adults/children counters + "Add More Rooms" list — factored
 * out of GuestsField's dropdown so the exact same UI (and SearchContext
 * wiring) can also be reused inside a centered modal (CartOverview's
 * "Modify Guests" popup) instead of an anchored dropdown.
 */
export function GuestsPicker({ rooms, onAddRoom, onRemoveRoom, onUpdateGuests }) {
  return (
    <>
      {rooms.map((room, idx) => (
        <div key={room.id} className="be-modal-room-item">
          <div className="be-modal-room-header">
            <span className="be-room-title">Room {idx + 1}</span>
            {rooms.length > 1 && (
              <button type="button" className="be-remove-room-btn" onClick={() => onRemoveRoom(room.id)}>
                Remove
              </button>
            )}
          </div>
          <div className="be-counters-grid">
            <div className="be-counter-item">
              <div className="be-counter-label-wrap">
                <span className="be-counter-label">Adults</span>
              </div>
              <div className="be-counter-control">
                <button type="button" className="be-counter-btn" onClick={() => onUpdateGuests(room.id, "adults", "dec")}>
                  —
                </button>
                <span className="be-counter-value">{room.adults}</span>
                <button type="button" className="be-counter-btn" onClick={() => onUpdateGuests(room.id, "adults", "inc")}>
                  +
                </button>
              </div>
            </div>
            <div className="be-counter-item">
              <div className="be-counter-label-wrap">
                <span className="be-counter-label">Children</span>
                <span className="be-counter-sublabel">(0-12 yrs)</span>
              </div>
              <div className="be-counter-control">
                <button type="button" className="be-counter-btn" onClick={() => onUpdateGuests(room.id, "children", "dec")}>
                  —
                </button>
                <span className="be-counter-value">{room.children}</span>
                <button type="button" className="be-counter-btn" onClick={() => onUpdateGuests(room.id, "children", "inc")}>
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="be-add-room-btn" onClick={onAddRoom} disabled={rooms.length >= 4}>
        + Add More Rooms
      </button>
    </>
  );
}
