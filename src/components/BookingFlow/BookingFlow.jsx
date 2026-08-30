"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../shared/Button.js";
import { SearchBar } from "../SearchBar/SearchBar.js";
import { Wizard } from "../Wizard/Wizard.js";
import { useBookingEngineTheme } from "../../theme/ThemeProvider.js";
import { themeToCssVariables } from "../../theme/cssVariables.js";
import "./BookingFlow.css";

/**
 * Composes the CTA button + SearchBar + Wizard into the two entry flows
 * real client requirements need, without every consumer having to hand-roll
 * the state machine:
 *
 *  - `entryMode="reveal"` (default): a "Book Now" CTA reveals the full
 *    capsule SearchBar inline; submitting it moves to the wizard, shown with
 *    a compact recap SearchBar on top (back arrow returns to the CTA).
 *  - `entryMode="direct"`: the CTA moves straight to the wizard + compact
 *    SearchBar, skipping the full-bar reveal stage — matches a plain "Book
 *    Now" hero button that should jump directly into room/rate selection.
 *
 * Pure composition of already-exported pieces (Button, SearchBar, Wizard) —
 * no changes to their internals beyond the `variant`/`onBack` props
 * SearchBar already exposes. Selecting a property/dates writes into
 * SearchContext immediately (see SearchBar's handleSelectProperty/
 * handleChangeRange), so StayStep starts fetching as soon as both are set,
 * even before the compact bar's search button is clicked again.
 *
 * Two extra props support splitting the flow across real pages (bawa's own
 * hero search bar does a real `router.push('/booking?...')` navigation, not
 * an in-page stage swap — see the README's "two entry flows" section):
 *  - `onNavigateToWizard(criteria)`: if provided, called instead of
 *    switching to the in-page "wizard" stage when the full/reveal search bar
 *    is submitted — hand it a router push to a dedicated wizard page. When
 *    provided, this component never renders `<Wizard>` itself.
 *  - `initialStage`: mount straight into `"wizard"` (or `"search"`) instead
 *    of `"cta"` — for a dedicated wizard-page consumer that already knows
 *    the user wants to search/book, reached via `onNavigateToWizard` above.
 *  - `onBackFromCta`: overrides the wizard/search stage's back-arrow — e.g.
 *    navigate back to the homepage instead of returning to an in-page "cta"
 *    stage that doesn't exist on a dedicated wizard page.
 *  - `mobileModal`: renders the "search" stage's SearchBar inside a fixed
 *    full-screen overlay (white background, "Close" header, page-scroll
 *    locked) instead of inline in the page flow. Pass the consumer's own
 *    mobile/desktop check here (this component has no viewport awareness
 *    of its own) — e.g. `mobileModal={window.innerWidth <= 992}`. Doesn't
 *    change the "wizard" stage or `entryMode="direct"` at all.
 *  - `openSignal`: bump this (e.g. a counter you increment) to force the
 *    "cta" stage straight to "search" from outside — for a header/menu
 *    "Book Now" link elsewhere on the page that should open this exact
 *    flow instead of just scrolling to it and leaving the user to tap the
 *    in-page CTA a second time. Only the value *changing* matters (so
 *    repeat clicks each re-open it even if a user already closed back to
 *    "cta" in between); the value itself is never read for anything else.
 */
export function BookingFlow({
  entryMode = "reveal",
  ctaLabel = "Book Now",
  onSearch,
  onComplete,
  className = "",
  initialStage,
  onNavigateToWizard,
  onBackFromCta,
  mobileModal = false,
  openSignal,
}) {
  const [stage, setStage] = useState(initialStage || "cta");
  const showMobileModal = mobileModal && stage === "search";

  useEffect(() => {
    if (openSignal) setStage("search");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  // The modal is portaled to document.body (see the render below) — an
  // ancestor like page.js's #booking-widget wrapper (position:relative;
  // z-index:3, needed so the desktop capsule overlaps the hero) creates its
  // own stacking context, and position:fixed does NOT escape an ancestor's
  // stacking context even though it's positioned relative to the viewport.
  // Confirmed the hard way: z-index:9999999 on the modal still rendered
  // behind the site header (z-index:10 at the page root), because the
  // modal's z-index was only ever being compared inside that z-index:3
  // context, not against the header's. A portal to body sidesteps the
  // ancestor chain entirely. document.body isn't available during SSR,
  // hence the mounted gate (same pattern SearchBar.jsx uses for its own
  // Toaster portal).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-derive the --be-color-*/--be-font-*/etc. custom properties ThemeProvider
  // set on [data-be-root] — the portal above lands outside that element's DOM
  // subtree (React context still reaches across a portal fine, hence this
  // hook working, but CSS custom-property inheritance follows the DOM tree,
  // not React's), so every var(--be-color-primary, ...) inside the portaled
  // SearchBar would otherwise silently fall back to its hardcoded default
  // instead of the real theme.
  const theme = useBookingEngineTheme();
  const portalCssVars = useMemo(() => themeToCssVariables(theme), [theme]);

  useEffect(() => {
    if (!showMobileModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showMobileModal]);

  const handleCtaClick = () => {
    setStage(entryMode === "direct" ? "wizard" : "search");
  };

  const handleSearch = (criteria) => {
    if (onNavigateToWizard) {
      onNavigateToWizard(criteria);
      return;
    }
    setStage("wizard");
    onSearch?.(criteria);
  };

  const handleBack = () => {
    if (onBackFromCta) {
      onBackFromCta();
      return;
    }
    setStage("cta");
  };

  return (
    <div className={`be-booking-flow ${className}`}>
      {stage === "cta" && (
        <div className="be-booking-flow-cta">
          <Button
            variant="primary"
            size="md"
            className="be-booking-flow-cta-btn"
            onClick={handleCtaClick}
          >
            {ctaLabel}
          </Button>
        </div>
      )}

      {stage === "search" &&
        showMobileModal &&
        mounted &&
        createPortal(
          <div
            className="be-booking-flow-mobile-modal"
            data-be-root
            style={portalCssVars}
          >
            <div className="be-booking-flow-mobile-modal-header">
              <button
                type="button"
                className="be-booking-flow-mobile-modal-close"
                onClick={() => setStage("cta")}
                aria-label="Close"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <SearchBar variant="full" onSearch={handleSearch} alwaysOpenDown />
          </div>,
          document.body,
        )}

      {stage === "search" && !showMobileModal && (
        <SearchBar
          variant="full"
          onSearch={handleSearch}
          onBack={onBackFromCta ? handleBack : undefined}
        />
      )}

      {stage === "wizard" && !onNavigateToWizard && (
        <Wizard
          onComplete={onComplete}
          syncStepToUrl={false}
          onSearch={handleSearch}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
