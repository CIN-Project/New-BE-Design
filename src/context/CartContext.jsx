"use client";

import { createDomainContext } from "./createDomainContext.js";

const initialState = {
  selectedAddOns: [],
  addonAmountTotal: 0,
  addonList: [],
  // Hotel the loaded addonList belongs to (AddOnsStep refetches when the guest picks another).
  addonPropertyId: null,
  // Bumped by the cart's "Add-ons … Modify" row to open the phone add-ons drawer again
  // (config.mobileAddOnsDrawer).
  addonsDrawerRequest: 0,
  selectedAddonList: [],
  selectedRateDataList: [],
  selectedTaxList: [],
  addOnsresponse: null,
  addonTaxTotal: 0,
  promoCodeContext: null,
  promoCodeCustomerContext: null,
  promoCodeDiscountMultiplier: 1.0,
  // config.rejectCartPromoNotValidForRooms: true while a promo applied from the cart waits for its
  // reprice, and the message shown when that promo didn't cover the cart's packages.
  cartPromoPending: false,
  promoCodeError: "",
  // config.rejectCartPromoNotValidForRooms: true while a promo applied from the cart waits for its
  // reprice, and the message shown when that promo didn't cover the cart's packages.
  cartPromoPending: false,
  promoCodeError: "",
  termsAndConditions: null,
  currentStep: null,
  userDetails: {
    title: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gstNumber: "",
    specialRequests: "",
    agreeToTerms: false,
  },
};

const { Provider, useDomainContext } = createDomainContext("CartContext", initialState);

export function CartProvider({ children }) {
  return <Provider>{children}</Provider>;
}

export function useCartContext() {
  const ctx = useDomainContext();

  const updateUserDetails = (newDetails) => {
    ctx.setUserDetails((prev) => ({ ...prev, ...newDetails }));
  };

  return { ...ctx, updateUserDetails };
}
