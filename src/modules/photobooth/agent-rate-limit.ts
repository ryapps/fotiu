import "server-only";

type Window = { startedAt: number; count: number };
const windows = new Map<string, Window>();
const periodMs = 60_000;

export function allowAgentRequest(
  key: string,
  limit: number,
  now = Date.now(),
) {
  let window = windows.get(key);
  if (!window || now - window.startedAt >= periodMs) {
    window = { startedAt: now, count: 0 };
    windows.set(key, window);
  }
  window.count += 1;

  if (windows.size > 2048) {
    for (const [entryKey, entry] of windows) {
      if (now - entry.startedAt >= periodMs) windows.delete(entryKey);
    }
  }
  return window.count <= limit;
}
