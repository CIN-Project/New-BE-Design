"use client";

import { createContext, useContext, useReducer, useMemo, useCallback } from "react";

function reducer(state, action) {
  switch (action.type) {
    case "RESET":
      return action.initialState;
    case "PATCH": {
      const value = typeof action.value === "function" ? action.value(state[action.key]) : action.value;
      return { ...state, [action.key]: value };
    }
    default:
      return state;
  }
}

function setterName(key) {
  return `set${key[0].toUpperCase()}${key.slice(1)}`;
}

/**
 * Builds a { Provider, useContext } pair backed by a single useReducer, with
 * one auto-generated setX(value) setter per initialState key (stable identity,
 * accepts either a value or an updater function — same call shape as useState).
 */
export function createDomainContext(name, initialState) {
  const Context = createContext(null);

  function Provider({ children, initialState: overrides }) {
    const [state, dispatch] = useReducer(reducer, { ...initialState, ...(overrides || {}) });

    const setters = useMemo(() => {
      const out = {};
      for (const key of Object.keys(initialState)) {
        out[setterName(key)] = (value) => dispatch({ type: "PATCH", key, value });
      }
      return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reset = useCallback(() => dispatch({ type: "RESET", initialState }), []);

    const value = useMemo(() => ({ ...state, ...setters, reset }), [state, setters, reset]);

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useDomainContext() {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error(`use${name}() must be used within its <${name}Provider>.`);
    }
    return ctx;
  }

  return { Context, Provider, useDomainContext };
}
