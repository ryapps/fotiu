import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { cancelBookingAsAdmin } from "@/modules/booking/admin-operations";
import {
  assignBooth,
  checkInBooking,
  completeBookingAsAdmin,
  startPhotoSession,
} from "@/modules/photobooth/operations";
import { POST as postAgentHeartbeat } from "@/app/api/agent/heartbeat/route";
import { POST as postAgentEvent } from "@/app/api/agent/events/route";
import { GET as claimAgentCommand } from "@/app/api/agent/commands/route";
import { createBoothAgent } from "@/modules/photobooth/agent";
import { createPhotoboothProvider } from "@/modules/photobooth/mock-provider";
import { getBoothReadStatus } from "@/modules/photobooth/domain";

const token = randomUUID();
const base = new Date(Date.now() + 10 * 24 * 60 * 60_000);
const userId = randomUUID();
const packageId = randomUUID();
const adminId = randomUUID();
const boothId = randomUUID();
const deviceToken = randomBytes(32).toString("base64url");
const bookingIds: string[] = [];
const sessionIds: string[] = [];

function localAgentFetcher(): typeof fetch {
  return async (input, init) => {
    const url =
      input instanceof Request
        ? new URL(input.url)
        : input instanceof URL
          ? input
          : new URL(input);
    const request = new Request(url, init);
    if (url.pathname === "/api/agent/heartbeat")
      return postAgentHeartbeat(request);
    if (url.pathname === "/api/agent/commands") {
      const { GET } = await import("@/app/api/agent/commands/route");
      return GET(request);
    }
    const resultMatch = /^\/api\/agent\/commands\/([^/]+)\/result$/.exec(
      url.pathname,
    );
    if (resultMatch) {
      const { POST } =
        await import("@/app/api/agent/commands/[id]/result/route");
      return POST(request, {
        params: Promise.resolve({ id: decodeURIComponent(resultMatch[1]) }),
      });
    }
    if (url.pathname === "/api/agent/events") return postAgentEvent(request);
    return new Response(null, { status: 404 });
  };
}

function makeAgent(input: {
  providerMode: "success" | "failure" | "unavailable" | "delay";
  completionDelayMs?: number;
  delayMs?: number;
}) {
  return createBoothAgent({
    config: {
      baseUrl: new URL("http://localhost"),
      deviceId: `pb4-${token}`,
      deviceToken,
      providerKey: "mock",
      mockMode: input.providerMode,
      mockDelayMs: input.delayMs ?? 0,
      mockCompletionDelayMs: input.completionDelayMs ?? 1500,
      pollIntervalMs: 1000,
    },
    provider: createPhotoboothProvider("mock", {
      mode: input.providerMode,
      delayMs: input.delayMs ?? 0,
      completionDelayMs: input.completionDelayMs ?? 1500,
    }),
    fetcher: localAgentFetcher(),
  });
}

async function makeBooking(
  index: number,
  paymentStatus = "PAID",
  startAtOverride?: Date,
) {
  const id = randomUUID();
  const startAt =
    startAtOverride ?? new Date(base.getTime() + index * 3 * 60 * 60_000);
  const endAt = new Date(startAt.getTime() + 60 * 60_000);
  bookingIds.push(id);
  await prisma.$executeRaw`
    INSERT INTO "bookings" ("id", "code", "userId", "packageId", "packageNameSnapshot", "priceSnapshot", "startAt", "endAt", "status", "createdAt", "updatedAt")
    VALUES (${id}, ${`pb4-${id}`}, ${userId}, ${packageId}, 'PB4 fixture', 100000, ${startAt}, ${endAt}, 'CONFIRMED', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    INSERT INTO "payments" ("id", "bookingId", "provider", "providerOrderId", "amount", "status", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${id}, 'integration', ${`pb4-${id}`}, 100000, ${paymentStatus}::"PaymentStatus", NOW(), NOW())
  `;
  return { id, startAt, endAt, now: new Date(startAt.getTime() + 5 * 60_000) };
}

describe.sequential("photobooth check-in and assignment against PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO "users" ("id", "googleSub", "email", "name", "createdAt")
      VALUES (${userId}, ${`pb4-${token}`}, ${`pb4-${token}@fotiu.test`}, 'PB4 fixture', NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO "packages" ("id", "slug", "name", "description", "price", "durationMinutes", "isActive", "sortOrder", "createdAt", "updatedAt")
      VALUES (${packageId}, ${`pb4-${token}`}, 'PB4 fixture', 'Integration fixture', 100000, 60, true, 0, NOW(), NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO "admins" ("id", "email", "passwordHash", "name", "isActive", "createdAt")
      VALUES (${adminId}, ${`pb4-${token}@fotiu.test`}, 'fixture-only', 'PB4 fixture', true, NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO "booths" ("id", "name", "deviceId", "providerKey", "agentTokenHash", "isMaintenance", "lastSeenAt", "createdAt", "updatedAt")
      VALUES (${boothId}, 'PB4 fixture', ${`pb4-${token}`}, 'mock', ${createHash("sha256").update(deviceToken).digest("hex")}, false, NOW(), NOW(), NOW())
    `;
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await prisma.$executeRaw`DELETE FROM "booth_events" WHERE "photoSessionId" = ANY(${sessionIds})`;
      await prisma.$executeRaw`DELETE FROM "booth_commands" WHERE "photoSessionId" = ANY(${sessionIds})`;
      await prisma.$executeRaw`DELETE FROM "photo_sessions" WHERE "id" = ANY(${sessionIds})`;
    }
    if (bookingIds.length) {
      await prisma.$executeRaw`DELETE FROM "payments" WHERE "bookingId" = ANY(${bookingIds})`;
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "id" = ANY(${bookingIds})`;
    }
    await prisma.$executeRaw`DELETE FROM "booths" WHERE "id" = ${boothId}`;
    await prisma.$executeRaw`DELETE FROM "admins" WHERE "id" = ${adminId}`;
    await prisma.$executeRaw`DELETE FROM "packages" WHERE "id" = ${packageId}`;
    await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${userId}`;
    await prisma.$disconnect();
  });

  it("checks in once, and only when PAID within the session window", async () => {
    const booking = await makeBooking(0);
    const before = await checkInBooking({
      bookingId: booking.id,
      adminId,
      now: new Date(booking.startAt.getTime() - 1),
    });
    expect(before).toEqual({ ok: false, code: "OUTSIDE_SCHEDULE" });
    const checkedIn = await checkInBooking({
      bookingId: booking.id,
      adminId,
      now: booking.now,
    });
    expect(checkedIn).toEqual({ ok: true });
    const duplicate = await checkInBooking({
      bookingId: booking.id,
      adminId,
      now: booking.now,
    });
    expect(duplicate).toEqual({ ok: false, code: "ALREADY_CHECKED_IN" });
    const stored = await prisma.$queryRaw<
      Array<{ checkedInByAdminId: string }>
    >`
      SELECT "checkedInByAdminId" FROM "bookings" WHERE "id" = ${booking.id}
    `;
    expect(stored[0]?.checkedInByAdminId).toBe(adminId);
  });

  it("rejects check-in unless payment is PAID", async () => {
    const booking = await makeBooking(1, "PENDING");
    const result = await checkInBooking({
      bookingId: booking.id,
      adminId,
      now: booking.now,
    });
    expect(result).toEqual({ ok: false, code: "INVALID_STATE" });
  });

  it("cancels a paid booking, releases a READY booth session, and flags refund", async () => {
    const booking = await makeBooking(20);
    expect(
      await checkInBooking({ bookingId: booking.id, adminId, now: booking.now }),
    ).toEqual({ ok: true });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${booking.now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now: booking.now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    const cancelled = await cancelBookingAsAdmin(booking.id, "Studio closed", booking.now);
    expect(cancelled).toEqual({
      ok: true,
      needsRefund: true,
      providerCancelFailed: false,
      sessionStillActive: false,
    });
    const state = await prisma.$queryRaw<Array<{ bookingStatus: string; sessionStatus: string }>>`
      SELECT b."status" AS "bookingStatus", s."status" AS "sessionStatus"
      FROM "bookings" b JOIN "photo_sessions" s ON s."bookingId" = b."id"
      WHERE b."id" = ${booking.id}
    `;
    expect(state).toEqual([{ bookingStatus: "CANCELLED", sessionStatus: "FAILED" }]);
  });

  it("rejects offline assignment, serializes duplicate assignments, and permits an audited retry", async () => {
    const first = await makeBooking(2);
    expect(
      await checkInBooking({
        bookingId: first.id,
        adminId,
        now: first.now,
      }),
    ).toEqual({ ok: true });

    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${new Date(first.now.getTime() - 10 * 60_000)} WHERE "id" = ${boothId}`;
    expect(
      await assignBooth({ bookingId: first.id, boothId, now: first.now }),
    ).toEqual({ ok: false, code: "BOOTH_UNAVAILABLE" });

    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${first.now} WHERE "id" = ${boothId}`;
    const competing = await Promise.all([
      assignBooth({ bookingId: first.id, boothId, now: first.now }),
      assignBooth({ bookingId: first.id, boothId, now: first.now }),
    ]);
    const successes = competing.filter((result) => result.ok);
    expect(successes).toHaveLength(1);
    expect(competing.filter((result) => !result.ok)).toHaveLength(1);
    const created = successes[0];
    if (!created?.ok || !created.photoSessionId)
      throw new Error("Expected an assigned session.");
    sessionIds.push(created.photoSessionId);

    await prisma.$executeRaw`
      UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${created.photoSessionId}
    `;
    const retry = await assignBooth({
      bookingId: first.id,
      boothId,
      now: first.now,
    });
    expect(retry.ok).toBe(true);
    if (retry.ok && retry.photoSessionId) sessionIds.push(retry.photoSessionId);
    if (retry.ok && retry.photoSessionId) {
      let constraintError: unknown;
      try {
        await prisma.$executeRaw`
          INSERT INTO "photo_sessions" ("id", "bookingId", "boothId", "providerKey", "status", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${first.id}, ${boothId}, 'mock', 'READY', NOW(), NOW())
        `;
      } catch (error) {
        constraintError = error;
      }
      expect(constraintError).toBeDefined();
      expect(JSON.stringify(constraintError)).toContain('"code":"23505"');
    }
    const history = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "photo_sessions" WHERE "bookingId" = ${first.id} ORDER BY "createdAt"
    `;
    expect(history.map((session) => session.status)).toEqual([
      "FAILED",
      "READY",
    ]);
    const retrySessionId = (
      await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "photo_sessions" WHERE "bookingId" = ${first.id} AND "status" = 'READY'
    `
    )[0]?.id;
    if (retrySessionId) {
      sessionIds.push(retrySessionId);
      await prisma.$executeRaw`
        UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = ${retrySessionId}
      `;
    }
  });

  it("claims one START_SESSION, keeps command SUCCESS separate from completion, and deduplicates events", async () => {
    const now = new Date();
    const booking = await makeBooking(
      4,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    expect(
      await checkInBooking({ bookingId: booking.id, adminId, now }),
    ).toEqual({ ok: true });
    await prisma.$executeRaw`
      UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}
    `;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);

    const starts = await Promise.all([
      startPhotoSession({
        photoSessionId: assigned.photoSessionId,
        bookingId: booking.id,
        now,
      }),
      startPhotoSession({
        photoSessionId: assigned.photoSessionId,
        bookingId: booking.id,
        now,
      }),
    ]);
    expect(starts).toEqual([
      expect.objectContaining({ ok: true, commandStatus: "PENDING" }),
      expect.objectContaining({ ok: true, commandStatus: "PENDING" }),
    ]);
    const commandCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM "booth_commands" WHERE "photoSessionId" = ${assigned.photoSessionId}
    `;
    expect(Number(commandCount[0]?.count)).toBe(1);

    const authorization = `Bearer ${deviceToken}`;
    const agent = makeAgent({
      providerMode: "success",
      completionDelayMs: 1500,
    });
    await agent.runOnce();
    const afterCommand = await prisma.$queryRaw<
      Array<{ sessionStatus: string; bookingStatus: string }>
    >`
      SELECT session."status" AS "sessionStatus", booking."status" AS "bookingStatus"
      FROM "photo_sessions" session JOIN "bookings" booking ON booking."id" = session."bookingId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(afterCommand[0]).toEqual({
      sessionStatus: "ACTIVE",
      bookingStatus: "CONFIRMED",
    });

    await new Promise((resolve) => setTimeout(resolve, 1600));
    await agent.runOnce();
    const completedEventId = createHash("sha256")
      .update(`${`pb4-${token}`}:${assigned.photoSessionId}:SESSION_COMPLETED`)
      .digest("hex");
    const duplicateEvent = await postAgentEvent(
      new Request("http://localhost/api/agent/events", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({
          eventId: completedEventId,
          photoSessionId: assigned.photoSessionId,
          type: "SESSION_COMPLETED",
          occurredAt: new Date().toISOString(),
        }),
      }),
    );
    expect(duplicateEvent.status).toBe(200);
    expect(await duplicateEvent.json()).toMatchObject({ duplicate: true });

    const finalState = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        bookingStatus: string;
        eventCount: bigint;
      }>
    >`
      SELECT session."status" AS "sessionStatus", booking."status" AS "bookingStatus",
        (SELECT count(*) FROM "booth_events" WHERE "photoSessionId" = session."id") AS "eventCount"
      FROM "photo_sessions" session JOIN "bookings" booking ON booking."id" = session."bookingId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(finalState[0]).toEqual({
      sessionStatus: "COMPLETED",
      bookingStatus: "COMPLETED",
      eventCount: BigInt(2),
    });
  });

  it("fails a pending session without calling the provider after its booking is cancelled", async () => {
    const now = new Date();
    const booking = await makeBooking(
      5,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    await checkInBooking({ bookingId: booking.id, adminId, now });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    await startPhotoSession({
      photoSessionId: assigned.photoSessionId,
      bookingId: booking.id,
      now,
    });
    await prisma.$executeRaw`
      UPDATE "bookings" SET "status" = 'CANCELLED', "updatedAt" = NOW()
      WHERE "id" = ${booking.id}
    `;

    const response = await claimAgentCommand(
      new Request("http://localhost/api/agent/commands", {
        headers: { authorization: `Bearer ${deviceToken}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, command: null });
    const state = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        commandStatus: string;
        bookingStatus: string;
      }>
    >`
      SELECT session."status" AS "sessionStatus", command."status" AS "commandStatus", booking."status" AS "bookingStatus"
      FROM "photo_sessions" session
      JOIN "booth_commands" command ON command."photoSessionId" = session."id"
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(state[0]).toEqual({
      sessionStatus: "FAILED",
      commandStatus: "FAILED",
      bookingStatus: "CANCELLED",
    });
  });

  it("leaves a STARTING session for admin reconciliation after an agent restart loses provider state", async () => {
    const now = new Date();
    const booking = await makeBooking(
      6,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    await checkInBooking({ bookingId: booking.id, adminId, now });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    await startPhotoSession({
      photoSessionId: assigned.photoSessionId,
      bookingId: booking.id,
      now,
    });
    const claimedResponse = await claimAgentCommand(
      new Request("http://localhost/api/agent/commands", {
        headers: { authorization: `Bearer ${deviceToken}` },
      }),
    );
    const claimed = (await claimedResponse.json()) as {
      command: { id: string; type: string } | null;
    };
    expect(claimed.command).toMatchObject({ type: "START_SESSION" });
    const boothBeforeReconnect = (
      await prisma.$queryRaw<
        Array<{
          isMaintenance: boolean;
          lastSeenAt: Date | null;
          hasActiveSession: boolean;
        }>
      >`
      SELECT booth."isMaintenance", booth."lastSeenAt",
        EXISTS (SELECT 1 FROM "photo_sessions" session WHERE session."boothId" = booth."id"
          AND session."status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')) AS "hasActiveSession"
      FROM "booths" booth WHERE booth."id" = ${boothId}
    `
    )[0];
    if (!boothBeforeReconnect) throw new Error("Expected the test booth.");
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${new Date(now.getTime() - 60_000)} WHERE "id" = ${boothId}`;
    expect(
      getBoothReadStatus({
        isMaintenance: boothBeforeReconnect.isMaintenance,
        lastSeenAt: new Date(now.getTime() - 60_000),
        hasActiveSession: true,
        now,
        heartbeatTimeoutSeconds: 45,
      }),
    ).toBe("OFFLINE");

    const restartedAgent = makeAgent({ providerMode: "success" });
    await restartedAgent.runOnce();
    const boothAfterReconnect = (
      await prisma.$queryRaw<
        Array<{
          isMaintenance: boolean;
          lastSeenAt: Date | null;
          hasActiveSession: boolean;
        }>
      >`
      SELECT booth."isMaintenance", booth."lastSeenAt",
        EXISTS (SELECT 1 FROM "photo_sessions" session WHERE session."boothId" = booth."id"
          AND session."status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')) AS "hasActiveSession"
      FROM "booths" booth WHERE booth."id" = ${boothId}
    `
    )[0];
    if (!boothAfterReconnect) throw new Error("Expected the test booth.");
    expect(
      getBoothReadStatus({
        isMaintenance: boothAfterReconnect.isMaintenance,
        lastSeenAt: boothAfterReconnect.lastSeenAt,
        hasActiveSession: boothAfterReconnect.hasActiveSession,
        now: new Date(),
        heartbeatTimeoutSeconds: 45,
      }),
    ).toBe("BUSY");
    const state = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        commandStatus: string;
        bookingStatus: string;
      }>
    >`
      SELECT session."status" AS "sessionStatus", command."status" AS "commandStatus", booking."status" AS "bookingStatus"
      FROM "photo_sessions" session
      JOIN "booth_commands" command ON command."photoSessionId" = session."id"
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(state[0]).toEqual({
      sessionStatus: "STARTING",
      commandStatus: "PROCESSING",
      bookingStatus: "CONFIRMED",
    });
    await prisma.$executeRaw`
      UPDATE "photo_sessions" SET "status" = 'FAILED', "failedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${assigned.photoSessionId}
    `;
    await prisma.$executeRaw`UPDATE "bookings" SET "status" = 'CANCELLED', "updatedAt" = NOW() WHERE "id" = ${booking.id}`;
  });

  it("reports provider unavailable/failure without completing booking", async () => {
    const now = new Date();
    const booking = await makeBooking(
      7,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    await checkInBooking({ bookingId: booking.id, adminId, now });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    await startPhotoSession({
      photoSessionId: assigned.photoSessionId,
      bookingId: booking.id,
      now,
    });
    await makeAgent({ providerMode: "unavailable" }).runOnce();
    const state = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        bookingStatus: string;
        maintenance: boolean;
      }>
    >`
      SELECT session."status" AS "sessionStatus", booking."status" AS "bookingStatus", booth."isMaintenance" AS maintenance
      FROM "photo_sessions" session
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      JOIN "booths" booth ON booth."id" = session."boothId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(state[0]).toEqual({
      sessionStatus: "FAILED",
      bookingStatus: "CONFIRMED",
      maintenance: false,
    });
    await prisma.$executeRaw`UPDATE "bookings" SET "status" = 'CANCELLED', "updatedAt" = NOW() WHERE "id" = ${booking.id}`;

    const failureNow = new Date();
    const failedBooking = await makeBooking(
      8,
      "PAID",
      new Date(failureNow.getTime() - 60_000),
    );
    await checkInBooking({
      bookingId: failedBooking.id,
      adminId,
      now: failureNow,
    });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${failureNow}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const failedAssignment = await assignBooth({
      bookingId: failedBooking.id,
      boothId,
      now: failureNow,
    });
    expect(failedAssignment.ok).toBe(true);
    if (!failedAssignment.ok || !failedAssignment.photoSessionId)
      throw new Error("Expected a READY photo session for provider failure.");
    sessionIds.push(failedAssignment.photoSessionId);
    await startPhotoSession({
      photoSessionId: failedAssignment.photoSessionId,
      bookingId: failedBooking.id,
      now: failureNow,
    });
    await makeAgent({
      providerMode: "failure",
      completionDelayMs: 0,
    }).runOnce();
    const failedState = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        bookingStatus: string;
        maintenance: boolean;
      }>
    >`
      SELECT session."status" AS "sessionStatus", booking."status" AS "bookingStatus", booth."isMaintenance" AS maintenance
      FROM "photo_sessions" session
      JOIN "bookings" booking ON booking."id" = session."bookingId"
      JOIN "booths" booth ON booth."id" = session."boothId"
      WHERE session."id" = ${failedAssignment.photoSessionId}
    `;
    expect(failedState[0]).toEqual({
      sessionStatus: "FAILED",
      bookingStatus: "CONFIRMED",
      maintenance: true,
    });
    expect(
      await completeBookingAsAdmin({
        bookingId: failedBooking.id,
        adminId,
        reason: "Provider melaporkan sesi gagal.",
        now: failureNow,
      }),
    ).toEqual({ ok: false, code: "SESSION_FAILED" });
    await prisma.$executeRaw`UPDATE "bookings" SET "status" = 'CANCELLED', "updatedAt" = NOW() WHERE "id" = ${failedBooking.id}`;
    await prisma.$executeRaw`UPDATE "booths" SET "isMaintenance" = false, "updatedAt" = NOW() WHERE "id" = ${boothId}`;
  });

  it("requires reason and admin recovery to complete a session with a missing provider event", async () => {
    const now = new Date();
    const booking = await makeBooking(
      9,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    await checkInBooking({ bookingId: booking.id, adminId, now });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    await startPhotoSession({
      photoSessionId: assigned.photoSessionId,
      bookingId: booking.id,
      now,
    });
    await makeAgent({
      providerMode: "success",
      completionDelayMs: 10_000,
    }).runOnce();

    expect(
      await completeBookingAsAdmin({
        bookingId: booking.id,
        adminId,
        reason: "  ",
        now,
      }),
    ).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(
      await completeBookingAsAdmin({
        bookingId: booking.id,
        adminId,
        now: new Date(booking.startAt.getTime() - 1),
      }),
    ).toEqual({ ok: false, code: "OUTSIDE_SCHEDULE" });
    expect(
      await completeBookingAsAdmin({
        bookingId: booking.id,
        adminId,
        now,
      }),
    ).toEqual({ ok: false, code: "SESSION_NOT_COMPLETED" });

    const recovered = await completeBookingAsAdmin({
      bookingId: booking.id,
      adminId,
      reason:
        "Admin memeriksa hasil foto di booth dan mengonfirmasi sesi selesai.",
      now,
    });
    expect(recovered.ok).toBe(true);
    const saved = await prisma.$queryRaw<
      Array<{
        sessionStatus: string;
        source: string;
        reason: string;
        completedByAdminId: string;
        bookingStatus: string;
      }>
    >`
      SELECT session."status" AS "sessionStatus", session."completionSource" AS source,
        session."completionReason" AS reason, session."completedByAdminId",
        booking."status" AS "bookingStatus"
      FROM "photo_sessions" session JOIN "bookings" booking ON booking."id" = session."bookingId"
      WHERE session."id" = ${assigned.photoSessionId}
    `;
    expect(saved[0]).toEqual({
      sessionStatus: "COMPLETED",
      source: "MANUAL_RECOVERY",
      reason:
        "Admin memeriksa hasil foto di booth dan mengonfirmasi sesi selesai.",
      completedByAdminId: adminId,
      bookingStatus: "COMPLETED",
    });
  });

  it("prevents a pending START_SESSION from being claimed after manual completion", async () => {
    const now = new Date();
    const booking = await makeBooking(
      10,
      "PAID",
      new Date(now.getTime() - 60_000),
    );
    await checkInBooking({ bookingId: booking.id, adminId, now });
    await prisma.$executeRaw`UPDATE "booths" SET "lastSeenAt" = ${now}, "isMaintenance" = false WHERE "id" = ${boothId}`;
    const assigned = await assignBooth({ bookingId: booking.id, boothId, now });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok || !assigned.photoSessionId)
      throw new Error("Expected a READY photo session.");
    sessionIds.push(assigned.photoSessionId);
    const started = await startPhotoSession({
      photoSessionId: assigned.photoSessionId,
      bookingId: booking.id,
      now,
    });
    expect(started.ok).toBe(true);

    const recovered = await completeBookingAsAdmin({
      bookingId: booking.id,
      adminId,
      reason: "Admin memverifikasi sesi foto selesai di studio.",
      now,
    });
    expect(recovered.ok).toBe(true);
    const [command] = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "booth_commands" WHERE "photoSessionId" = ${assigned.photoSessionId}
    `;
    expect(command?.status).toBe("FAILED");
  });
});
