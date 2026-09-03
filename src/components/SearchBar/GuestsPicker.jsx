"use client";

import { useState } from "react";
import "./SearchBar.css";

/**
 * The per-room adults/children counters + "Add More Rooms" list — factored
 * out of GuestsField's dropdown so the exact same UI (and SearchContext
 * wiring) can also be reused inside a centered modal (CartOverview's
 * "Modify Guests" popup) instead of an anchored dropdown.
 *
 * @param {Array<{maxAdult?: number, maxChildren?: number}|undefined>} [roomLimits] -
 *   real per-room occupancy limits, position-matched to `rooms` (same index
 *   pairing DetailStep.jsx uses between searchRooms and selectedRoom).
 *   Passed only by GuestsModal.jsx ("Modify Guests", reached after a real
 *   room has already been picked for that slot) — GuestsField's own search-
 *   bar dropdown (before any room is selected, so no real limit exists yet)
 *   omits it entirely, which keeps that dropdown's counters exactly as
 *   before: no inline messages, no disabling, clamped only to the generic
 *   4 adults/3 children ceiling. When a limit IS known, it's authoritative
 *   over that generic ceiling (can be lower OR higher).
 *
 * The limit message/disable only ever appears in response to an actual
 * blocked click — never merely because the current value happens to equal
 * the max (or the floor). Reaching exactly the max is a normal, valid state
 * (the default guest count can easily already equal a room's real max, e.g.
 * 2 adults in a 2-adult room) — deriving "at limit" straight from the value
 * would show "Max 2 adults allowed" on a room nobody has touched yet. So
 * each button starts enabled regardless of value; clicking + past the real
 * max is intercepted (the count doesn't change), which is what surfaces the
 * message and disables that button going forward. Decrementing away from
 * the max (or re-adding a room at 0/1) clears it again.
 */
export function GuestsPicker({ rooms, roomLimits, onAddRoom, onRemoveRoom, onUpdateGuests }) {
  // { [roomId]: { adults: bool, children: bool } } — true once a blocked
  // attempt has actually happened for that counter.
  const [blocked, setBlocked] = useState({});

  const setBlockedField = (roomId, field, value) => {
    setBlocked((prev) => {
      if (Boolean(prev[roomId]?.[field]) === value) return prev;
      return { ...prev, [roomId]: { ...prev[roomId], [field]: value } };
    });
  };

  const handleIncrement = (room, field, max) => {
    const atLimit = max != null && room[field] >= max;
    if (atLimit) {
      setBlockedField(room.id, field, true);
      return;
    }
    setBlockedField(room.id, field, false);
    onUpdateGuests(room.id, field, "inc", max);
  };

  const handleDecrement = (room, field) => {
    setBlockedField(room.id, field, false);
    onUpdateGuests(room.id, field, "dec");
  };

  return (
    <>
      {rooms.map((room, idx) => {
        const limits = roomLimits?.[idx];
        const maxAdult = limits?.maxAdult;
        const maxChildren = limits?.maxChildren;
        const adultsBlocked = Boolean(blocked[room.id]?.adults);
        const childrenBlocked = Boolean(blocked[room.id]?.children);

        return (
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
                  <button
                    type="button"
                    className="be-counter-btn"
                    disabled={room.adults <= 1}
                    onClick={() => handleDecrement(room, "adults")}
                  >
                    —
                  </button>
                  <span className="be-counter-value">{room.adults}</span>
                  <button
                    type="button"
                    className="be-counter-btn"
                    disabled={adultsBlocked}
                    onClick={() => handleIncrement(room, "adults", maxAdult)}
                  >
                    +
                  </button>
                </div>
                {adultsBlocked && (
                  <span className="be-counter-limit-msg">
                    Max {maxAdult} adult{maxAdult === 1 ? "" : "s"} allowed
                  </span>
                )}
              </div>
              <div className="be-counter-item">
                <div className="be-counter-label-wrap">
                  <span className="be-counter-label">Children</span>
                  <span className="be-counter-sublabel">(0-12 yrs)</span>
                </div>
                <div className="be-counter-control">
                  <button
                    type="button"
                    className="be-counter-btn"
                    disabled={room.children <= 0}
                    onClick={() => handleDecrement(room, "children")}
                  >
                    —
                  </button>
                  <span className="be-counter-value">{room.children}</span>
                  <button
                    type="button"
                    className="be-counter-btn"
                    disabled={childrenBlocked}
                    onClick={() => handleIncrement(room, "children", maxChildren)}
                  >
                    +
                  </button>
                </div>
                {childrenBlocked && (
                  <span className="be-counter-limit-msg">
                    Max {maxChildren} child{maxChildren === 1 ? "" : "ren"} allowed
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="be-add-room-btn" onClick={onAddRoom}>
        + Add More Rooms
      </button>
    </>
  );
}
