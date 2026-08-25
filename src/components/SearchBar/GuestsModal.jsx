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
    <Modal isOpen={isOpen} onClose={onClose} title="Modify Guests" subtitle="Select rooms and guests for your stay">
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
