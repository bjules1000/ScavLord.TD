/** Canonical frontend DEV-tools gate. No query-string bypass. */

export type DevToolsEnv = {
  DEV?: boolean;
  VITE_ENABLE_DEV_TOOLS?: string;
};

/**
 * local `vite` / `bun` DEV → on
 * Vercel Preview: set VITE_ENABLE_DEV_TOOLS=true
 * Production: leave unset or false
 */
export function readDevToolsEnabled(env: DevToolsEnv): boolean {
  return env.DEV === true || env.VITE_ENABLE_DEV_TOOLS === "true";
}

function currentViteEnv(): DevToolsEnv {
  const env = (import.meta as { env?: DevToolsEnv }).env;
  return env ?? {};
}

export const DEV_TOOLS_ENABLED = readDevToolsEnabled(currentViteEnv());
