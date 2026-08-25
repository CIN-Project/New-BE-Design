"use client";

import { useState } from "react";
import "./ImageSlider.css";

/**
 * Minimal background-image carousel with dot pagination + hover arrows.
 * Used anywhere a room can have more than one photo (room-row card, the
 * Read More details modal) — falls back to a single static image (no
 * controls) when there's nothing to page through.
 */
export function ImageSlider({ images, className = "", style }) {
  const list = (images || []).filter(Boolean);
  const [index, setIndex] = useState(0);

  if (list.length === 0) {
    return <div className={`be-img-slider ${className}`} style={style} />;
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
      className={`be-img-slider ${className}`}
      style={{ backgroundImage: `url(${list[index]})`, ...style }}
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
