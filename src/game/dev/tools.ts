/** Canonical frontend DEV-tools gate. No query-string bypass. */

export type DevToolsEnv = {
  DEV?: boolean;
  VITE_ENABLE_DEV_TOOLS?: string;
};

/**
 * local vite/bun DEV → on
 * Vercel Preview: set VITE_ENABLE_DEV_TOOLS=true
 * Production: leave unset/false AND set DEV_TOOLS_VISIBLE = false before merge
 */
export function readDevToolsEnabled(env: DevToolsEnv): boolean {
  return env.DEV === true || env.VITE_ENABLE_DEV_TOOLS === "true";
}

function currentViteEnv(): DevToolsEnv {
  const env = (import.meta as { env?: DevToolsEnv }).env;
  return env ?? {};
}

/**
 * Extra local toggle so Preview QA does not depend on an env var.
 * Flip to false before a production merge.
 */
export const DEV_TOOLS_VISIBLE = true;

export function isDevToolsEnabled(env: DevToolsEnv = currentViteEnv(), visible = DEV_TOOLS_VISIBLE): boolean {
  return readDevToolsEnabled(env) || visible === true;
}

export const DEV_TOOLS_ENABLED = isDevToolsEnabled();
