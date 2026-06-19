export function isAuthGateEnabled(): boolean {
  if (import.meta.env.MODE === "test") {
    return false;
  }

  return import.meta.env.VITE_AUTH_GATE !== "false";
}
