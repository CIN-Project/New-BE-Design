"use client";

import { useState } from "react";
import "./ImageSlider.css";

/**
 * Minimal background-image carousel with dot pagination + hover arrows.
 * Used anywhere a room can have more than one photo (room-row card, the
 * Read More details modal) — falls back to a single static image (no
 * controls) when there's nothing to page through. `onClick` makes the photo
 * itself clickable (the arrows/dots stop propagation, so they still only page).
 */
export function ImageSlider({ images, className = "", style, onClick, clickLabel }) {
  const list = (images || []).filter(Boolean);
  const [index, setIndex] = useState(0);

  // Click/Enter/Space on the photo itself (not on an arrow or dot inside it).
  const clickProps = onClick
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": clickLabel,
        onClick,
        onKeyDown: (e) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          onClick(e);
        },
      }
    : {};
  const clickableClass = onClick ? " be-img-slider--clickable" : "";

  if (list.length === 0) {
    return <div className={`be-img-slider${clickableClass} ${className}`} style={style} {...clickProps} />;
  }

  const goTo = (i, e) => {
    e?.stopPropagation();
    setIndex(i);
  };

  const prev = (e) => {
    e?.stopPropagation();
    setIndex((i) => (i - 1 + list.length) % list.length);
  };

  const next = (e) => {
    e?.stopPropagation();
    setIndex((i) => (i + 1) % list.length);
  };

  return (
    <div
      className={`be-img-slider${clickableClass} ${className}`}
      style={{ backgroundImage: `url("${list[index]}")`, ...style }}
      {...clickProps}
    >
      {list.length > 1 && (
        <>
          <button type="button" className="be-img-slider-arrow be-img-slider-prev" onClick={prev} aria-label="Previous image">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button type="button" className="be-img-slider-arrow be-img-slider-next" onClick={next} aria-label="Next image">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div className="be-img-slider-dots">
            {list.map((_, i) => (
              <span
                key={i}
                className={`be-img-slider-dot${i === index ? " be-active" : ""}`}
                onClick={(e) => goTo(i, e)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
