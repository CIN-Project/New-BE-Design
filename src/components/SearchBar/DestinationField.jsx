"use client";

/**
 * A property's booking-identifier: `staahPropertyId` is the real field
 * (see api/properties.js's mapCityWithPropertyResponse doc comment for why —
 * it's what every rate/room/calendar API call needs, not the CMS `propertyId`).
 * Falls back to `propertyId`/`id` for consumers supplying an older/simpler
 * shape (e.g. a hand-written `config.properties` mock).
 */
function propertyKey(p) {
  return p.staahPropertyId ?? p.propertyId ?? p.id;
}

function propertyLabel(p) {
  return p.propertyName ?? p.name;
}

function propertyCity(p) {
  return p.cityName ?? p.city ?? "Other";
}

function groupByCity(properties) {
  const groups = new Map();
  for (const p of properties) {
    const city = propertyCity(p);
    if (!groups.has(city)) groups.set(city, []);
    groups.get(city).push(p);
  }
  return groups;
}

export function DestinationField({
  properties,
  selectedPropertyId,
  onSelect,
  isOpen,
  onToggle,
  modalRef,
  triggerId,
  openUpwards,
}) {
  const selected = properties.find(
    (p) => propertyKey(p) === selectedPropertyId,
  );
  const groups = groupByCity(properties);

  return (
    <div
      className="be-form-group be-location-group"
      style={{ position: "relative" }}
    >
      <svg
        className="be-field-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <div className="be-form-field-inputs" id={triggerId} onClick={onToggle}>
        <label>Location</label>
        <div className="be-custom-select-display">
          <span className="be-truncate">
            {propertyLabel(selected || {}) || "Select location..."}
          </span>
          <svg
            className="be-field-icon"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ marginLeft: 8, opacity: 0.8 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div
          ref={modalRef}
          className={`be-destination-modal be-modal-anim ${openUpwards ? "be-modal--open-up" : ""}`}
        >
          {[...groups.entries()].map(([city, list]) => (
            <div className="be-destination-group" key={city}>
              <span className="be-destination-group-title">{city}</span>
              <div className="be-destination-options">
                {list.map((p) => {
                  const key = propertyKey(p);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`be-destination-option ${selectedPropertyId === key ? "be-destination-option--selected" : ""}`}
                      onClick={() => onSelect(p)}
                    >
                      {propertyLabel(p)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
