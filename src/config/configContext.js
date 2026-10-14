import { createContext, useContext } from "react";

export const ConfigContext = createContext(null);

export function useConfig() {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error(
      "useConfig() was called outside of a <BookingEngineProvider>. Wrap your app with <BookingEngineProvider config={{...}}> from 'booking-engine-new/config'.",
    );
  }
  return config;
}

export function requireConfig(config, key, feature) {
  if (config[key] === undefined || config[key] === null || config[key] === "") {
    throw new Error(
      `BookingEngineProvider config.${key} is required for ${feature}. Pass it via <BookingEngineProvider config={{ ${key}: "..." }}>.`,
    );
  }
  return config[key];
}
