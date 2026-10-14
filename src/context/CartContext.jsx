"use client";

import { createDomainContext } from "./createDomainContext.js";

const initialState = {
  selectedAddOns: [],
  addonAmountTotal: 0,
  addonList: [],
  selectedAddonList: [],
  selectedRateDataList: [],
  selectedTaxList: [],
  addOnsresponse: null,
  addonTaxTotal: 0,
  promoCodeContext: null,
  promoCodeCustomerContext: null,
  promoCodeDiscountMultiplier: 1.0,
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
