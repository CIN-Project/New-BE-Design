"use client";

import { SearchProvider } from "./SearchContext.js";
import { StayProvider } from "./StayContext.js";
import { CartProvider } from "./CartContext.js";
import { BookingEngineAuthProvider } from "./AuthContext.js";

/**
 * Convenience composition of all domain providers (Search/Stay/Cart/Auth).
 * Mount once near the root of your app, inside <BookingEngineProvider config={...}>.
 */
export function BookingEngineRoot({ children }) {
  return (
    <BookingEngineAuthProvider>
      <SearchProvider>
        <StayProvider>
          <CartProvider>{children}</CartProvider>
        </StayProvider>
      </SearchProvider>
    </BookingEngineAuthProvider>
  );
}
