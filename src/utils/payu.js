/**
 * PayU hosted-checkout redirect.
 *
 * Asks the CONSUMING app's own server route (config.payuInitiateUrl, default
 * "/api/payu/initiate") to build the signed PayU form fields — the PayU salt
 * must never live in the browser — then auto-submits a hidden form that
 * POSTs the guest to PayU's hosted payment page.
 *
 * Nothing here talks to STAAH. The reservation is staged with STAAH
 * *before* this is called (DetailStep.jsx), and confirmed *after* the guest
 * returns successfully (Wizard.jsx -> ConfirmStep.jsx).
 */
export async function redirectToPayU(
  config,
  { reservationId, amount, firstname, email, phone, productinfo },
) {
  const initiateUrl = config?.payuInitiateUrl || "/api/payu/initiate";

  const res = await fetch(initiateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reservationId,
      amount,
      firstname,
      email,
      phone,
      productinfo,
    }),
  });
  if (!res.ok) {
    throw new Error("Could not start the PayU payment. Please try again.");
  }
  const { action, fields } = await res.json();
  if (!action || !fields) {
    throw new Error("PayU is not configured correctly. Please contact support.");
  }

  // Same "came back from the gateway" bookkeeping redirectToPayment() does
  // for STAAH (see paymentHash.js for why each of these exists).
  const marker = new URLSearchParams(window.location.search);
  marker.set("pay-now", "1");
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}?${marker.toString()}`,
  );
  try {
    window.sessionStorage.setItem("be_wentToPaymentGateway", "1");
  } catch {
    // sessionStorage unavailable — non-fatal.
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
