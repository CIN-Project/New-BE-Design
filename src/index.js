export const VERSION = "0.1.0";

export { BookingEngineThemeProvider, useBookingEngineTheme } from "./theme/ThemeProvider.js";
export { defaultTheme } from "./theme/defaultTheme.js";

export { BookingEngineProvider, useConfig } from "./config/ConfigProvider.js";
export { defaultConfig } from "./config/defaultConfig.js";

export { Button } from "./components/shared/Button.js";
export { SearchBar } from "./components/SearchBar/SearchBar.js";
export { RangeCalendar } from "./components/DatePicker/RangeCalendar.js";
export { Wizard, StepIndicator, StayStep, AddOnsStep, DetailStep, ConfirmStep } from "./components/Wizard/index.js";
export { CartOverview, CouponComponent } from "./components/Cart/index.js";
export { LoyaltyUnlockModal } from "./components/Auth/index.js";
export { BookingFlow } from "./components/BookingFlow/index.js";

export { BookingEngineRoot } from "./context/BookingEngineRoot.js";
export { SearchProvider, useSearchContext } from "./context/SearchContext.js";
export { StayProvider, useStayContext } from "./context/StayContext.js";
export { CartProvider, useCartContext } from "./context/CartContext.js";
export { BookingEngineAuthProvider, useBookingEngineAuth } from "./context/AuthContext.js";

export * as ratesApi from "./api/rates.js";
export * as propertiesApi from "./api/properties.js";
export * as paymentApi from "./api/payment.js";
export * as authApi from "./api/auth.js";
