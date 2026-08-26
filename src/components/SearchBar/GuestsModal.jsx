"use client";

import { Modal } from "../shared/Modal.js";
import { GuestsPicker } from "./GuestsPicker.js";
import { useSearchContext } from "../../context/SearchContext.js";

/**
 * "Modify Guests" — reached from the cart sidebar's "Modify Guests" link.
 * Reads and writes SearchContext's searchRooms directly (the same state the
 * search bar's own Travelers field uses), so a change made here is visible
 * everywhere else in the app immediately.
 */
export function GuestsModal({ isOpen, onClose }) {
  const search = useSearchContext();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Modify Guests"
      subtitle="Select rooms and guests for your stay"
      // Explicit and independent of DateRangeModal's own maxWidth={740} —
      // both used to rely on Modal's shared default (640) for this one,
      // which meant "fixing" this modal's width by touching the shared
      // .be-modal-box CSS class (see Modal.css) instead of this prop ended
      // up resizing DateRangeModal too. 640 matches this modal's existing
      // look; change only this number to resize just this modal.
      maxWidth={400}
    >
      <GuestsPicker
        rooms={search.searchRooms}
        onAddRoom={search.addSearchRoom}
        onRemoveRoom={search.removeSearchRoom}
        onUpdateGuests={search.updateSearchRoomGuests}
      />
      <div className="be-modal-footer">
        <button type="button" className="be-btn-done" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
