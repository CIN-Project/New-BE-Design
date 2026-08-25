"use client";

import { useState } from "react";
import { Button } from "../shared/Button.js";
import { SearchBar } from "../SearchBar/SearchBar.js";
import { Wizard } from "../Wizard/Wizard.js";
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
}) {
  const [stage, setStage] = useState(initialStage || "cta");

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

      {stage === "search" && (
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
