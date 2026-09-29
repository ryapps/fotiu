const DEFAULT_CALLBACK_PATH = "/dashboard";

export function getSafeCallbackPath(
  input: string | null | undefined,
  baseUrl: string,
  fallback = DEFAULT_CALLBACK_PATH,
): string {
  if (!input) return fallback;

  try {
    const base = new URL(baseUrl);
    const candidate = new URL(input, base);

    if (candidate.origin !== base.origin) return fallback;

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
