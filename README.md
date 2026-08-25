# booking-engine-new

A standalone, themeable hotel booking engine for Next.js apps — search bar, multi-step booking wizard, cart, coupons, and a loyalty-member OTP unlock flow. Ships with a luxury gold/charcoal/ivory visual design by default (fonts, colors, and animations matched value-for-value against a reference design), but every color, font, and radius is overridable from the consuming app. All booking logic (rate search, room/rate selection, payment, member auth) is real and wired to your own hotel-booking API credentials — nothing here is mock data.

## Install

```json
{
  "dependencies": {
    "booking-engine-new": "github:CIN-Project/booking-engine-new"
  }
}
```

`npm install` triggers the package's `prepare` script automatically, which builds it from source — there is no manual build step for consumers.

**Peer dependencies**: `next` `>=15.5.0 <17`, `react` `^19.0.0`, `react-dom` `^19.0.0`.

## Quick start

```jsx
// app/layout.js (or wherever you mount your app shell)
import {
  BookingEngineThemeProvider,
  BookingEngineProvider,
  BookingEngineRoot,
} from "booking-engine-new";
import "booking-engine-new/styles.css";

const bookingConfig = {
  staahBaseUrl: process.env.NEXT_PUBLIC_STAAH_BASE_URL,
  staahSignatureSecret: process.env.STAAH_SIGNATURE_SECRET, // server-only, see Security note below
  apiKeyGetRate: process.env.NEXT_PUBLIC_API_KEY_GETRATE,
  cmsBaseUrl: process.env.NEXT_PUBLIC_CMS_BASE_URL,
  cmsRoomRatesBaseUrl: process.env.NEXT_PUBLIC_CMS_ROOM_RATES_BASE_URL,
  tokenDbKey: process.env.NEXT_PUBLIC_TOKEN_DB_KEY,
  membersApiUrl: process.env.NEXT_PUBLIC_MEMBERS_API,
  membersApiUserId: process.env.MEMBERS_API_USER_ID, // server-only
  membersApiPassword: process.env.MEMBERS_API_PASSWORD, // server-only
  properties: [
    { id: "12345", name: "Property Name", city: "Mumbai" },
    // ...your properties, grouped by `city` in the search-bar destination dropdown
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <BookingEngineThemeProvider>
          <BookingEngineProvider config={bookingConfig}>
            <BookingEngineRoot>{children}</BookingEngineRoot>
          </BookingEngineProvider>
        </BookingEngineThemeProvider>
      </body>
    </html>
  );
}
```

```jsx
// A page with the search bar
import { SearchBar } from "booking-engine-new";

export default function HomePage() {
  return <SearchBar onSearch={(criteria) => { /* route to your booking page, e.g. router.push(`/booking?...`) */ }} />;
}
```

```jsx
// Your booking page
import { Wizard } from "booking-engine-new";

export default function BookingPage() {
  return <Wizard onComplete={() => { /* optional hook, fires just before the STAAH payment redirect navigates away */ }} />;
}
```

`<BookingEngineThemeProvider>`, `<BookingEngineProvider>`, and `<BookingEngineRoot>` (which composes the Search/Stay/Cart/Auth domain contexts) should each be mounted **once**, near the root of your app — not per-page or per-widget.

## Theming

Every color, font, radius, spacing value, and transition speed is a CSS custom property, prefixed `--be-` so it never collides with your app's own CSS variables. Pass a `theme` prop to override any of them; anything you don't pass falls back to the built-in default palette, so the package renders correctly with **zero** theme configuration.

```jsx
<BookingEngineThemeProvider
  theme={{
    colors: {
      primary: "#846836",       // --be-color-primary — the brand gold used by buttons, prices, links, active states everywhere
      primaryHover: "#bfa15f",  // --be-color-primary-hover — :hover state for the above
      primaryLight: "#c7a36a",  // --be-color-primary-light — lighter accent (calendar selected-day, secondary borders)
      onPrimary: "#FFFFFF",     // --be-color-on-primary (text on primary buttons)
      surface: "#F8F5EF",       // --be-color-surface
      surfaceAlt: "#E8E6E2",    // --be-color-surface-alt
      text: "#1D1D1D",          // --be-color-text
      textMuted: "rgba(29,29,29,0.65)", // --be-color-text-muted
      accent: "#30453A",        // --be-color-accent
      border: "#E8E6E2",        // --be-color-border
      success: "#2E7D32",       // --be-color-success
      error: "#C62828",         // --be-color-error
    },
    fonts: {
      serif: "var(--font-serif), Georgia, serif", // --be-font-serif — headings/rate titles
      sans: "var(--font-sans), system-ui, sans-serif", // --be-font-sans — everything else
    },
    radius: { sm: "2px", md: "4px", pill: "999px" },
    spacing: { xs: "4px", sm: "8px", md: "16px", lg: "32px", xl: "64px" },
    transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",       // --be-transition-smooth
    transitionFast: "all 0.3s ease",                             // --be-transition-fast
    transitionSlow: "all 1.8s cubic-bezier(0.16, 1, 0.3, 1)",    // --be-transition-slow
  }}
>
```

**Fonts**: pass already-resolved font values — a CSS variable reference from your own `next/font/google` setup (as in the example above), or a literal font-family string. The package never calls `next/font` itself, since that API only works when invoked directly in a consuming app's own file tree.

Fonts can also be set via `config` instead of `theme` — see `fontFamily`/`fontSerif`/`fontSans` in the Configuration table below. Both paths write to the same `--be-font-serif`/`--be-font-sans` variables; `config`'s values win if both are set (it's rendered further down the tree). Neither is required — with nothing set, the package renders with its own built-in fonts (Cormorant Garamond / Inter).

**Scoping**: `ThemeProvider` renders a wrapper `<div data-be-root>` carrying the CSS variables as inline styles, so you can also wrap just part of a page to re-theme only that section.

## Configuration (`BookingEngineProvider config={...}`)

| Config key | Required for | Notes |
|---|---|---|
| `staahBaseUrl` | Rate search, room selection, payment, token verification | STAAH booking-engine API base URL |
| `staahSignatureSecret` | All signed STAAH calls (HMAC-SHA256) | **Server-only secret** — see Security note |
| `apiKeyGetRate` | Room/rate search | Sent as `x-api-key` header |
| `cmsBaseUrl` | Property/gallery lookups, promo verification, booking status | |
| `cmsRoomRatesBaseUrl` | Room/rate search | Often `${cmsBaseUrl}/StaahData` — a separate path prefix in the STAAH integration, not necessarily a different host |
| `tokenDbKey` | Token verification, reservation ID generation | Internal per-property DB key |
| `membersApiUrl` | Loyalty/member login, OTP, profile | |
| `membersApiUserId` / `membersApiPassword` | Loyalty/member login | **Server-only secret** — see Security note. These are the Members API's own service-account credentials, not a guest's login |
| `properties` | Search bar destination list | `[{ staahPropertyId, propertyId, propertyName, cityName, cityId, propertySlug?, staahBookingId?, phone? }]` — grouped by `cityName` in the dropdown. `staahPropertyId` (not `propertyId`) is what's actually sent to every rate/room/calendar API call — see the Security-adjacent note in `propertiesApi.mapCityWithPropertyResponse`'s doc comment. A simpler `{ id, name, city }` shape is also accepted as a fallback for hand-written mocks. |
| `otpLength` | Loyalty OTP unlock | Default `6` |
| `defaultMemberPromoCode` | Payment | Optional fallback promo code applied when a guest books a member rate with no promo entered — property-specific business data, no default |
| `sessionTimeoutMs` | Member login session | Default `30 * 60 * 1000` (30 minutes) |
| `fontFamily` | Visual only | Sets both `--be-font-serif` and `--be-font-sans` to this one value — for a consumer with a single brand font. No default (package fonts render untouched). |
| `fontSerif` / `fontSans` | Visual only | Override either role individually; wins over `fontFamily` for that slot. No default. |
| `primaryColor` / `primaryHoverColor` / `primaryLightColor` | Visual only | Set `--be-color-primary` / `-hover` / `-light` — every button background, price, link, and active-state color in the package reads from these three. No default (package's built-in gold palette renders untouched). |
| `debug` | All API calls | Default `false` — logs request/response detail when `true` |

Every field is optional at the provider level — a missing value only throws when a specific feature that actually needs it is used (e.g. rendering `<SearchBar>` without `apiKeyGetRate` set is fine until a search is submitted), with a clear error naming exactly which config key is missing and why.

### Security note

`staahSignatureSecret`, `membersApiUserId`, and `membersApiPassword` are real secrets — Amritara's original codebase had these hardcoded directly in client-side source, which this package fixes by making them configuration instead. That fix only holds if **you** don't repeat the mistake: these three values should come from server-only environment variables (no `NEXT_PUBLIC_` prefix) proxied to the client through your own backend or a Next.js Route Handler, not committed to source or exposed via a public env var. The other config keys (base URLs, API keys meant for client use, property list) are fine as `NEXT_PUBLIC_*` values.

## Components

| Component | Purpose |
|---|---|
| `<BookingFlow entryMode="reveal"\|"direct" ctaLabel="Book Now" onSearch={} onComplete={} />` | Drop-in composition of a CTA button + `SearchBar` + `Wizard` for the two entry flows client requirements typically ask for — see below |
| `<SearchBar onSearch={(criteria) => {}} variant="full"\|"compact" onBack={} />` | The capsule search widget — destination, dates, guests, promo code. `variant="compact"` renders the same fields as a slim recap bar with an optional back arrow (used atop the wizard) |
| `<Wizard onComplete={() => {}} syncStepToUrl={true} />` | The full 4-step booking flow (room/rate → guest details + add-ons → payment → confirmation) |
| `<StayStep onRoomsSelected={() => {}} />` | Room/rate selection alone, if you want to compose your own wizard shell |
| `<AddOnsStep />` | Add-on carousel alone |
| `<DetailStep.GuestDetailsForm onContinue={() => {}} />` / `<DetailStep.PaymentForm onBack={} onComplete={} />` | Guest form and payment form, individually |
| `<ConfirmStep homeUrl="/" onRetry={() => {}} />` | Confirmation/receipt, or a failure/pending state if there's no successful payment response to show |
| `<CartOverview onModifyRooms={() => {}} />` | The persistent cart sidebar |
| `<CouponComponent />` | Promo code input, real `VerifyPromoCode` API-backed (rendered inside `CartOverview` already — only needed standalone if you're composing your own layout) |
| `<LoyaltyUnlockModal isOpen onClose={} onUnlocked={(user) => {}} onDeclineStandardRate={() => {}} />` | The member-rate OTP unlock modal (already wired into `StayStep`) |
| `<RangeCalendar rangeStart rangeEnd onChangeRange />` | The dual-month date-range picker used by the search bar, exposed standalone |
| `<Button variant="primary"\|"outline"\|"ghost" size="sm"\|"md">` | Shared themed button |

### Two entry flows with `BookingFlow`

Different client sites want different first impressions. `BookingFlow` composes the pieces above into both, switched by a single prop:

```jsx
// Client A: a "Book Now" button reveals the full capsule search bar; submitting it opens the wizard.
<BookingFlow entryMode="reveal" />

// Client B: a "Book Now" button (e.g. sitting on a hero banner) opens the wizard directly —
// no full-bar reveal step — with the compact recap SearchBar shown at the top instead.
<BookingFlow entryMode="direct" />
```

Both stages after the CTA use the same `SearchBar` component (`variant="full"` then `variant="compact"`) and the same `Wizard` — selecting a destination/dates writes straight into `SearchContext`, so `StayStep` starts fetching rooms as soon as both are picked, without needing the form to be submitted again. If you want full manual control instead (custom hero layout, your own CTA styling), compose `SearchBar`/`Wizard` yourself rather than using `BookingFlow`.

### Calendar day-rates are self-fetching

`SearchBar`'s date-range calendar fetches real per-day prices and sold-out markers automatically once a property is selected (via the same STAAH-signed `/api/cin-api/rate-et` endpoint Amritara's own date picker uses) — no wiring required. Pass `getDayRate`/`isDateSoldOut`/`holidays` explicitly to override this (e.g. if you have your own rate-caching layer).

### Real city-grouped destinations

`propertiesApi.getCityWithProperty(config)` (no `cityId`) fetches every city with its properties in one call, matching how Amritara's own root layout builds its site-wide dropdown. Pair it with `propertiesApi.mapCityWithPropertyResponse(data)` to get the flat `{ staahPropertyId, propertyId, propertyName, propertySlug, staahBookingId, cityName, cityId }[]` shape `config.properties` expects, grouped correctly in the destination dropdown:

```jsx
const data = await propertiesApi.getCityWithProperty(config);
const properties = propertiesApi.mapCityWithPropertyResponse(data);
```

## Known scope exclusions

- **STAAH's separate email/password Login/SignUp system** is not ported — only the loyalty-member OTP flow (`AuthContext`/`LoyaltyUnlockModal`) is, since that's the flow that pairs with the member-rate unlock UX. If you need the separate account-login system, it isn't part of this package.
- **A WMR-style embedded widget** (an alternate booking-widget embed mechanism referenced but commented out in the source this was ported from) isn't included — it wasn't live in the reference app either.

## Local development

No monorepo tooling is used — develop against a sibling throwaway Next.js app:

```
some-parent-dir/
  booking-engine-new/       (this repo)
  your-testbed-app/         (a plain `npx create-next-app`)
```

```bash
cd booking-engine-new && npm link
cd ../your-testbed-app && npm link booking-engine-new
```

Run `npm run dev` (in `booking-engine-new`) for a `tsup --watch` build, or `npm run build` for a one-off build; the testbed's dev server picks up the linked package. If you hit duplicate-React errors from `npm link`'s peer-dependency resolution, fall back to a `"booking-engine-new": "file:../booking-engine-new"` dependency instead (requires re-running `npm install` after each change rather than picking up watch mode automatically).

Before publishing a change, verify the actual consumption path works too: push to a branch, point a real consumer's `package.json` at `"github:CIN-Project/booking-engine-new#your-branch"`, and confirm a clean `npm install` builds automatically via `prepare` with no manual step.

## Scripts

- `npm run build` — one-off `tsup` build to `dist/`
- `npm run dev` — `tsup --watch`
- `npm run prepare` — runs `build`; this is what npm invokes automatically on install as a git dependency
