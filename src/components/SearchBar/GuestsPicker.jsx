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
 *
 * @param {number} [minChildAge] - youngest selectable age (Trevon's
 *   PropertyData.InfantAge). Defaults to 0 when the caller doesn't know a
 *   real property's value yet (e.g. the search bar's own Travelers field,
 *   used before any property is necessarily chosen).
 * @param {number} [maxChildAge] - oldest selectable age (Trevon's
 *   PropertyData.ChildAge). Defaults to 12, matching this component's
 *   pre-existing "(0-12 yrs)" sublabel.
 */
export function GuestsPicker({
  rooms,
  roomLimits,
  onAddRoom,
  onRemoveRoom,
  onUpdateGuests,
  onUpdateChildAge,
  minChildAge = 0,
  maxChildAge = 12,
}) {
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
                  <span className="be-counter-sublabel">
                    ({minChildAge}-{maxChildAge} yrs)
                  </span>
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
            {/* One required age dropdown per child — ported from Trevon's
                RoomManager.js (~341-366). `childAges` is kept position-
                matched to `children` by SearchContext's
                updateSearchRoomGuests, so its length always equals
                room.children; this never falls back to room.children
                itself. "" is the "Select Age" placeholder/sentinel, same
                value Trevon uses, enforced before search (SearchBar.jsx)
                and before payment (DetailStep.jsx). */}
            {room.children > 0 && (
              <div className="be-child-ages-wrap">
                {(room.childAges || []).map((age, childIndex) => (
                  <div key={childIndex} className="be-child-age-item">
                    <label className="be-child-age-label">
                      Child {childIndex + 1} Age{" "}
                      <span className="be-child-age-required">*</span>
                    </label>
                    <select
                      className="be-child-age-select"
                      value={age}
                      onChange={(e) =>
                        onUpdateChildAge?.(room.id, childIndex, e.target.value)
                      }
                    >
                      <option value="" disabled>
                        Select Age
                      </option>
                      {Array.from(
                        { length: maxChildAge - minChildAge + 1 },
                        (_, i) => minChildAge + i,
                      ).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="be-add-room-btn" onClick={onAddRoom}>
        + Add More Rooms
      </button>
    </>
  );
}
