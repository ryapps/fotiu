// Exact origins only: never allow arbitrary sites to frame the booking app.
export function publicFramePolicy(origins = "") {
  const allowed = origins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of allowed) {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value.includes("*") ||
      /[\s;]/.test(value)
    ) {
      throw new Error(
        "PORTFOLIO_EMBED_ORIGINS must contain exact HTTPS origins (HTTP is allowed only for localhost).",
      );
    }
  }
  return allowed.length
    ? `frame-ancestors ${[...new Set(allowed.map((value) => new URL(value).origin))].join(" ")};`
    : "frame-ancestors 'none';";
}
