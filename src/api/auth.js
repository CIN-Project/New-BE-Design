import { requireConfig } from "../config/configContext.js";

const jpost = async (url, body, token, debug) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (debug)
    console.log("[booking-engine-new/auth] POST", url, {
      hasToken: !!token,
      body,
    });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  let json = null;
  let text = null;
  try {
    json = await res.json();
  } catch {
    try {
      text = await res.text();
    } catch {
      /* noop */
    }
  }
  const out = json ?? {
    success: false,
    errorCode: res.status,
    error: text || "HTTP error",
  };

  if (debug) console.log("[booking-engine-new/auth] RESP", url, out);
  return out;
};

// config.membersApiFormat "v2" (MemberLoyaltyApis): kebab-case endpoints (/generate-token,
// /get-otp, /verify-otp, /sign-up), camelCase bodies, and { success, code, message, data } replies.
// Each call is translated back to the v1 reply shape ({ success, errorCode, result, error }) that
// AuthContext reads, so the login flow itself is shared by both formats.
function createAuthApiV2(config, baseUrl, debug) {
  const post = async (path, body, token) => {
    const url = `${baseUrl()}/${path}`;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (debug) console.log("[booking-engine-new/auth] POST", url, { hasToken: !!token, body });
    let res;
    let json = null;
    try {
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
      json = await res.json();
    } catch {
      /* noop — handled below */
    }
    if (debug) console.log("[booking-engine-new/auth] RESP", url, res?.status, json);
    return { status: res?.status ?? 0, json };
  };
  // Token rejected (401) → errorCode 1008, the same code AuthContext refreshes the token on.
  const fail = ({ status, json }) => ({
    success: false,
    errorCode: status === 401 ? 1008 : json?.code ?? status,
    error: json?.message || `HTTP ${status || "error"}`,
    result: json?.message || "",
  });
  const unsupported = (name) => async () => {
    throw new Error(`${name} is not available in the v2 members API.`);
  };

  const generateTokenRaw = async () => {
    const userId = requireConfig(config, "membersApiUserId", "member auth");
    const password = requireConfig(config, "membersApiPassword", "member auth");
    const { status, json } = await post("generate-token", { userId, password });
    return { json, headers: {}, status };
  };

  const getOtp = async (token, payload) => {
    const r = await post(
      "get-otp",
      { mobileNo: payload?.MobileNo || "", emailId: payload?.EmailId || "" },
      token,
    );
    if (r.json?.success !== true) return fail(r);
    return { success: true, errorCode: 0, result: r.json?.data?.message || r.json?.message || "OTP sent." };
  };

  // errorCode 0 = existing member (result[0] = profile), 1 = new member (no membership yet).
  const verifyOtp = async (token, payload) => {
    const r = await post(
      "verify-otp",
      { mobileNo: payload?.MobileNo || "", emailId: payload?.EmailId || "", otp: payload?.Otp || "" },
      token,
    );
    if (r.json?.success !== true) return fail(r);
    const data = r.json?.data || {};
    if (data.isNewMember) return { success: true, errorCode: 1, result: [] };
    return {
      success: true,
      errorCode: 0,
      result: [{ ...data, MembershipId: data.membershipId, CardNo: data.cardno, cardNo: data.cardno }],
    };
  };

  const signup = async (token, payload) => {
    const r = await post(
      "sign-up",
      {
        firstName: payload?.FirstName || "",
        lastName: payload?.LastName || "",
        mobilePrifix: payload?.MobilePrifix || "+91",
        mobileNo: payload?.MobileNo || "",
        emailId: payload?.EmailId || "",
        city: payload?.City || "",
        stateCode: payload?.StateCode || "",
        country: payload?.Country || "",
        privacyPolicyAcceptance: true,
        otp: payload?.Otp || "",
      },
      token,
    );
    if (r.json?.success !== true) return fail(r);
    const data = r.json?.data || {};
    return {
      success: true,
      errorCode: 0,
      result: [{ ...data, MembershipId: data.membershipId, CardNo: data.cardno, cardNo: data.cardno }],
    };
  };

  return {
    generateTokenRaw,
    getOtp,
    verifyOtp,
    // v2's verify-otp already returns the profile; there is no profile/update/lookup endpoint.
    profileInfo: unsupported("ProfileInfo"),
    updateProfile: unsupported("UpdateProfile"),
    getCountry: unsupported("GetCountry"),
    getState: unsupported("GetState"),
    getCity: unsupported("GetCity"),
    getTransaction: unsupported("GetTransaction"),
    submitQuery: unsupported("Queries"),
    signup,
  };
}

export function createAuthApi(config) {
  const debug = !!config.debug;
  if (config.membersApiFormat === "v2") {
    const v2BaseUrl = () =>
      String(requireConfig(config, "membersApiUrl", "member auth")).replace(/\/+$/, "");
    return createAuthApiV2(config, v2BaseUrl, debug);
  }
  // Config is validated lazily (per call) rather than at factory-creation
  // time, so mounting <BookingEngineAuthProvider> doesn't require member-auth
  // config from consumers who never touch the loyalty/login flow.
  const baseUrl = () => requireConfig(config, "membersApiUrl", "member auth");

  const generateTokenRaw = async () => {
    const url = baseUrl();
    const userId = requireConfig(config, "membersApiUserId", "member auth");
    const password = requireConfig(config, "membersApiPassword", "member auth");
    const res = await fetch(`${url}/GenerateToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ UserId: userId, Password: password }),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* noop */
    }
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { json, headers, status: res.status };
  };

  const getOtp = (token, payload) =>
    jpost(`${baseUrl()}/GetOtp`, payload, token, debug);
  const verifyOtp = (token, payload) =>
    jpost(`${baseUrl()}/VerifyOtp`, payload, token, debug);
  const profileInfo = (token, membershipId) =>
    jpost(
      `${baseUrl()}/ProfileInfo`,
      { MembershipId: membershipId },
      token,
      debug,
    );
  const updateProfile = (token, payload) =>
    jpost(`${baseUrl()}/UpdateProfile`, payload, token, debug);
  const getCountry = (token) =>
    jpost(`${baseUrl()}/GetCountry`, {}, token, debug);
  const getState = (token, CountryCode = "") =>
    jpost(`${baseUrl()}/GetState`, { CountryCode }, token, debug);
  const getCity = (token, StateCode = "") =>
    jpost(`${baseUrl()}/GetCity`, { StateCode }, token, debug);
  const getTransaction = (token, payload) =>
    jpost(`${baseUrl()}/GetTransaction`, payload, token, debug);
  const submitQuery = (token, payload) =>
    jpost(`${baseUrl()}/Queries`, payload, token, debug);

  const signup = async (token, payload) => {
    let countryCode = "";
    try {
      if (payload?.Country) {
        const countries = await getCountry(token);
        const list =
          countries?.Data || countries?.data || countries?.result || countries;
        if (Array.isArray(list)) {
          const match = list.find((c) => {
            const name = (c?.CountryName || c?.countryName || c?.Name || "")
              .toString()
              .trim()
              .toLowerCase();
            return name === payload.Country.toString().trim().toLowerCase();
          });
          countryCode =
            match?.CountryCode || match?.countryCode || match?.Code || "";
        }
      }
    } catch (e) {
      if (debug)
        console.warn(
          "[booking-engine-new/auth] GetCountry failed (non-fatal):",
          e,
        );
    }

    const variants = [];
    variants.push({
      url: `${baseUrl()}/signup`,
      body: {
        ...payload,
        ...(countryCode ? { CountryCode: countryCode } : {}),
      },
    });
    variants.push({
      url: `${baseUrl()}/SignUp`,
      body: {
        ...payload,
        ...(countryCode ? { CountryCode: countryCode } : {}),
      },
    });

    const bodyPrefix = { ...payload };
    if (bodyPrefix.MobilePrifix && !bodyPrefix.MobilePrefix) {
      bodyPrefix.MobilePrefix = bodyPrefix.MobilePrifix;
      delete bodyPrefix.MobilePrifix;
    }
    variants.push({
      url: `${baseUrl()}/signup`,
      body: {
        ...bodyPrefix,
        ...(countryCode ? { CountryCode: countryCode } : {}),
      },
    });
    variants.push({
      url: `${baseUrl()}/SignUp`,
      body: {
        ...bodyPrefix,
        ...(countryCode ? { CountryCode: countryCode } : {}),
      },
    });

    let last = null;
    for (const v of variants) {
      const resp = await jpost(v.url, v.body, token, debug);
      last = resp;
      if (resp?.success === true && Number(resp?.errorCode) === 0) {
        return resp;
      }
    }
    return last;
  };

  return {
    generateTokenRaw,
    getOtp,
    verifyOtp,
    profileInfo,
    updateProfile,
    getCountry,
    getState,
    getCity,
    getTransaction,
    submitQuery,
    signup,
  };
}
