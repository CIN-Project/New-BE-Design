"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConfig } from "../config/configContext.js";
import { createAuthApi } from "../api/auth.js";
import {
  truthy,
  normalizeUser,
  isProfileComplete,
  isValidOtp,
  extractTokenFromGenerateToken,
} from "../utils/authNormalize.js";

const SESSION_KEYS = {
  user: "be_user",
  token: "be_token",
  sessionTime: "be_sessionTime",
  pendingIdentity: "be_pendingIdentity",
};

const AuthContext = createContext(null);

export function BookingEngineAuthProvider({ children }) {
  const config = useConfig();
  const api = useMemo(() => createAuthApi(config), [config]);
  const otpLength = config.otpLength ?? 6;
  const sessionTimeoutMs = config.sessionTimeoutMs ?? 30 * 60 * 1000;

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const u = sessionStorage.getItem(SESSION_KEYS.user);
    const t = sessionStorage.getItem(SESSION_KEYS.token);
    const ts = sessionStorage.getItem(SESSION_KEYS.sessionTime);

    if (u && t && ts) {
      const age = Date.now() - Number(ts);
      if (age > sessionTimeoutMs) {
        logout();
      } else {
        try {
          setUser(JSON.parse(u));
        } catch (err) {
          if (config.debug)
            console.error("[booking-engine-new] Invalid session user", err);
          sessionStorage.removeItem(SESSION_KEYS.user);
        }
        setToken(t);
      }
    }

    const handleUnload = () => sessionStorage.clear();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const ts = sessionStorage.getItem(SESSION_KEYS.sessionTime);
      if (ts && Date.now() - Number(ts) > sessionTimeoutMs) {
        logout();
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureToken = async () => {
    const cached = sessionStorage.getItem(SESSION_KEYS.token);
    if (cached) {
      setToken(cached);
      return cached;
    }
    const raw = await api.generateTokenRaw();
    const tk = extractTokenFromGenerateToken(raw);
    if (!tk)
      throw new Error(
        "Could not obtain auth token from GenerateToken response.",
      );
    setToken(tk);
    sessionStorage.setItem(SESSION_KEYS.token, tk);
    sessionStorage.setItem(SESSION_KEYS.sessionTime, Date.now().toString());
    return tk;
  };

  const requestOtp = async (mobile = "", email = "") => {
    const authToken = await ensureToken();
    const r = await api.getOtp(authToken, { MobileNo: mobile, EmailId: email });
    if (r?.success === true && Number(r?.errorCode) === 0) {
      return { ok: true, message: String(r?.result || "OTP sent.") };
    }
    return {
      ok: false,
      message: r?.result || r?.error || "Failed to send OTP",
    };
  };

  const loginWithOtp = async (
    mobile = "",
    otp,
    email = "",
    mobilePrefix = "+91",
  ) => {
    let authToken = await ensureToken();
    if (!isValidOtp(otp, otpLength))
      throw new Error(`OTP must be ${otpLength} digits.`);

    let v = await api.verifyOtp(authToken, {
      MobileNo: mobile,
      EmailId: email,
      Otp: otp,
    });
    if (Number(v?.errorCode) === 1008) {
      const fresh = await api.generateTokenRaw();
      const tk = extractTokenFromGenerateToken(fresh);
      if (!tk) throw new Error("Could not refresh token for VerifyOtp.");
      setToken(tk);
      sessionStorage.setItem(SESSION_KEYS.token, tk);
      sessionStorage.setItem(SESSION_KEYS.sessionTime, Date.now().toString());
      authToken = tk;
      v = await api.verifyOtp(authToken, {
        MobileNo: mobile,
        EmailId: email,
        Otp: otp,
      });
    }
    if (v?.success !== true)
      throw new Error(v?.error || "OTP verification failed");

    const code = Number(v?.errorCode);
    const row =
      Array.isArray(v?.result) && v.result.length ? v.result[0] : null;

    let resolved;
    if (code === 0) {
      const minimal = normalizeUser(row || {});
      if (minimal.MemberId) {
        try {
          const profRes = await api.profileInfo(authToken, minimal.MemberId);
          const profRaw =
            Array.isArray(profRes?.result) && profRes.result.length
              ? profRes.result[0]
              : profRes?.Data || profRes || {};
          const prof = normalizeUser(profRaw);
          resolved = {
            ...minimal,
            ...prof,
            MemberId: prof.MemberId || minimal.MemberId,
          };
        } catch {
          resolved = minimal;
        }
      } else {
        resolved = minimal;
      }
    } else if (code === 1) {
      resolved = normalizeUser({
        MobilePrifix: mobile ? mobilePrefix : undefined,
        MobileNo: mobile || undefined,
        EmailId: email || undefined,
      });
    } else {
      throw new Error(v?.error || "OTP verification failed");
    }

    setUser(resolved);
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(resolved));
    sessionStorage.setItem(
      SESSION_KEYS.pendingIdentity,
      JSON.stringify({ mobile, email, mobilePrefix }),
    );
    sessionStorage.setItem(SESSION_KEYS.sessionTime, Date.now().toString());

    const isNewUser =
      code === 0 ? false : code === 1 || !isProfileComplete(resolved);
    return { user: resolved, isNewUser };
  };

  const saveProfileAndRefresh = async (form) => {
    const authToken = await ensureToken();
    let raw;

    if (!truthy(user?.MemberId)) {
      raw = await api.signup(authToken, {
        FirstName: form.FirstName,
        LastName: form.LastName,
        MobilePrifix: form.MobilePrifix || "+91",
        MobileNo: form.MobileNo,
        EmailId: form.EmailId,
        City: form.City,
        StateCode: form.StateCode,
        Country: form.Country,
        DateofBirth: form.DateofBirth || "",
        WeddingAnniversary: form.WeddingAnniversary || "",
        Gender: form.Gender || "",
        Address: form.Address || "",
        PrivacyPolicyAcceptance: "Y",
      });
      if (!(raw?.success === true && Number(raw?.errorCode) === 0)) {
        throw new Error(raw?.result || raw?.error || "Sign up failed");
      }
    } else {
      raw = await api.updateProfile(authToken, {
        MembershipId: user.MemberId,
        FirstName: form.FirstName,
        LastName: form.LastName,
        MobileNo: form.MobileNo,
        EmailId: form.EmailId,
        City: form.City,
        StateCode: form.StateCode,
        Country: form.Country,
        DateofBirth: form.DateofBirth || "",
        WeddingAnniversary: form.WeddingAnniversary || "",
        Gender: form.Gender || "",
        Address: form.Address || "",
      });
      if (!(raw?.success === true && Number(raw?.errorCode) === 0)) {
        throw new Error(raw?.result || raw?.error || "Update failed");
      }
      const profRes = await api.profileInfo(authToken, user.MemberId);
      raw =
        Array.isArray(profRes?.result) && profRes.result.length
          ? profRes.result[0]
          : profRes?.Data || {};
    }

    const server = normalizeUser(raw);
    const merged = { ...server, PrivacyPolicyAcceptance: "Y" };

    setUser(merged);
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(merged));
    sessionStorage.setItem(SESSION_KEYS.sessionTime, Date.now().toString());
    return merged;
  };

  const updateUser = (updates) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...updates };
      sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    sessionStorage.clear();
    setUser(null);
    setToken(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      ensureToken,
      requestOtp,
      loginWithOtp,
      saveProfileAndRefresh,
      updateUser,
      logout,
      api,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useBookingEngineAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useBookingEngineAuth() was called outside of a <BookingEngineAuthProvider>.",
    );
  }
  return ctx;
}
