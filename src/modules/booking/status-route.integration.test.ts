import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/bookings/[id]/status/route";

const token = randomUUID();
const ownerId = randomUUID();
const otherId = randomUUID();
const packageId = randomUUID();
const bookingId = randomUUID();

function setSession(id: string | null) {
  authMock.mockResolvedValue(id ? {
    user: { id, role: "CUSTOMER", name: null, email: null, image: null },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } : null);
}

describe("customer booking status route authorization against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({ data: [
      { id: ownerId, googleSub: `${token}-owner`, email: `${token}-owner@test.invalid`, name: "Owner" },
      { id: otherId, googleSub: `${token}-other`, email: `${token}-other@test.invalid`, name: "Other" },
    ] });
    await prisma.package.create({ data: {
      id: packageId, slug: `idor-${token}`, name: "IDOR fixture", description: "Test", price: 1000, durationMinutes: 30,
    } });
    await prisma.booking.create({ data: {
      id: bookingId, code: `idor-${token}`, userId: ownerId, packageId,
      packageNameSnapshot: "IDOR fixture", priceSnapshot: 1000,
      startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 86_400_000 + 1_800_000),
      status: "WAITING_PAYMENT", holdExpiresAt: new Date(Date.now() + 60_000),
    } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect();
  });

  it("returns status to the owner, 404 to another customer, and 401 without a session", async () => {
    setSession(ownerId);
    const owner = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: bookingId }) });
    expect(owner.status).toBe(200);
    expect(await owner.json()).toMatchObject({ ok: true, bookingStatus: "WAITING_PAYMENT" });

    const polls = await Promise.all(Array.from({ length: 12 }, () =>
      GET(new Request("http://localhost"), { params: Promise.resolve({ id: bookingId }) }),
    ));
    expect(polls.map((response) => response.status)).toEqual(Array(12).fill(200));

    setSession(otherId);
    const other = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: bookingId }) });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ ok: false, code: "NOT_FOUND" });

    setSession(null);
    const anonymous = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: bookingId }) });
    expect(anonymous.status).toBe(401);
  });
});
