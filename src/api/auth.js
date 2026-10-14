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

export function createAuthApi(config) {
  const debug = !!config.debug;
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
