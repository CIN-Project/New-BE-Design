export const truthy = (v) => v !== undefined && v !== null && String(v).trim() !== "";

const toNum = (v, d = 0) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : d;
};

export function normalizeUser(raw = {}) {
  const u = raw || {};
  const PPA = (u.PrivacyPolicyAcceptance ?? u.PPAcceptance ?? u.IsTermsAccepted ?? "")
    .toString()
    .toUpperCase();

  return {
    MemberId:
      u.MembershipId ?? u.MemberId ?? u.membershipId ?? u.cardNo ?? u.CardNo ?? u.Id ?? u.MemberID ?? null,
    CardNo: u.cardNo ?? u.CardNo ?? null,
    FirstName:
      u.FirstName ?? u.firstname ?? u.firstName ?? u.GivenName ?? u.Name?.split?.(" ")?.[0] ?? "",
    LastName:
      u.LastName ??
      u.lastname ??
      u.lastName ??
      u.Surname ??
      (u.Name?.split?.(" ")?.slice(1).join(" ") ?? ""),
    EmailId: u.EmailId ?? u.emailId ?? u.Email ?? u.EmailID ?? "",
    MobilePrifix: u.MobilePrifix ?? u.MobilePrefix ?? u.CountryCode ?? "+91",
    MobileNo: u.MobileNo ?? u.mobileNumber ?? u.Mobile ?? u.Phone ?? u.PhoneNumber ?? "",
    City: u.City ?? u.cityName ?? "",
    StateCode: u.StateCode ?? u.stateName ?? "",
    Country: u.Country ?? u.country ?? "",
    TierId: u.tierId ?? "",
    TierName: u.tierName ?? "",
    PointsBalance: toNum(u.pointsBalance, 0),
    PointsToNextTier: toNum(u.pointstoNextTier, 0),
    StaysToNextTier: toNum(u.staystoNextTier, 0),
    TotalStays: toNum(u.totalStays, 0),
    EnrolDate: u.enrolDate ?? "",
    TierEndDate: u.tierEndDate ?? "",
    PointsExpiryDate: u.dateofPontsExpiry ?? "",
    PointsExpiryAmt: toNum(u.amountofPontsExpiry, 0),
    MemberCreateDate: u.memberCreateDate ?? "",
    DateofBirth: u.dateofBirth ?? "",
    WeddingAnniversary: u.weddingAnniversary ?? "",
    Gender: u.Gender ?? u.gender ?? "",
    Address: u.Address ?? u.address ?? "",
    PrivacyPolicyAcceptance: PPA === "Y" ? "Y" : u.cardNo || u.CardNo ? "Y" : "N",
    _raw: u,
  };
}

export function isProfileComplete(nu) {
  return (
    (truthy(nu.MemberId) || truthy(nu.CardNo)) &&
    (truthy(nu.FirstName) || truthy(nu.LastName)) &&
    (truthy(nu.EmailId) || truthy(nu.MobileNo))
  );
}

export function isValidOtp(otp, otpLength = 6) {
  const pattern = new RegExp(`^[0-9]{${otpLength}}$`);
  return pattern.test(String(otp || "").trim());
}

function pluckTokenFromObject(obj) {
  let found = "";
  const seen = new Set();
  const visit = (val) => {
    if (!val || seen.has(val)) return;
    if (typeof val === "string") {
      if (val.length >= 20 && !/\s/.test(val)) {
        if (!found) found = val;
      }
      return;
    }
    if (Array.isArray(val)) {
      for (const x of val) visit(x);
      return;
    }
    if (typeof val === "object") {
      seen.add(val);
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (/token|auth|bearer/i.test(k)) {
          if (typeof v === "string" && v.length >= 20 && !/\s/.test(v)) {
            if (!found) found = v;
          } else {
            visit(v);
          }
        } else {
          visit(v);
        }
      }
    }
  };
  visit(obj);
  return found;
}

export function extractTokenFromGenerateToken({ json, headers }) {
  const direct =
    json?.Data?.Token ||
    json?.data?.token ||
    json?.Result?.Token ||
    json?.result?.token ||
    json?.Token ||
    json?.token ||
    "";
  if (direct && direct.length >= 20) return direct;

  const scanned = pluckTokenFromObject(json);
  if (scanned) return scanned;

  const hAuth = headers?.authorization || headers?.["x-auth-token"] || headers?.["x-token"];
  if (hAuth && hAuth.length >= 20) {
    const parts = hAuth.split(/\s+/);
    return parts.length > 1 ? parts[1] : parts[0];
  }
  return "";
}
