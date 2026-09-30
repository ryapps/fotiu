import { createHash, timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(authorization: string | null, secret: string) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(secret).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest) && supplied.length > 0;
}
