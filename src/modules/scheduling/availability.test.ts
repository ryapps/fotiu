import { describe, expect, it } from "vitest";
import { calculateAvailability } from "@/modules/scheduling/availability";

const date = "2026-01-01";
const now = new Date("2026-01-01T00:00:00.000Z"); // 07:00 in Asia/Jakarta

function calculate(
  overrides: Partial<Parameters<typeof calculateAvailability>[0]> = {},
) {
  return calculateAvailability({
    date,
    timeZone: "Asia/Jakarta",
    now,
    isOpen: true,
    openTime: "09:00",
    closeTime: "12:00",
    durationMinutes: 60,
    bufferMinutes: 0,
    slotIntervalMinutes: 60,
    minLeadHours: 2,
    maxAdvanceDays: 60,
    bookings: [],
    blocks: [],
    ...overrides,
  });
}

describe("calculateAvailability", () => {
  it("returns no slots on a closed or past day", () => {
    expect(calculate({ isOpen: false })).toEqual([]);
    expect(calculate({ date: "2025-12-31" })).toEqual([]);
  });

  it("keeps slots inside operating hours and includes package duration plus buffer", () => {
    const slots = calculate({ bufferMinutes: 30 });
    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2026-01-01T02:00:00.000Z",
      "2026-01-01T03:00:00.000Z",
    ]);
    expect(slots[0].endAt.toISOString()).toBe("2026-01-01T03:30:00.000Z");
  });

  it("applies the minimum lead time and maximum advance date", () => {
    expect(
      calculate({ minLeadHours: 3 }).map(({ startAt }) =>
        startAt.toISOString(),
      ),
    ).toEqual(["2026-01-01T03:00:00.000Z", "2026-01-01T04:00:00.000Z"]);
    expect(calculate({ date: "2026-03-03" })).toEqual([]);
    expect(calculate({ date: "2026-03-02" })).toHaveLength(3);
  });

  it("filters active bookings using half-open overlap ranges", () => {
    const slots = calculate({
      bookings: [
        {
          startAt: new Date("2026-01-01T03:00:00.000Z"),
          endAt: new Date("2026-01-01T04:00:00.000Z"),
          status: "CONFIRMED",
          holdExpiresAt: null,
        },
      ],
    });
    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2026-01-01T02:00:00.000Z",
      "2026-01-01T04:00:00.000Z",
    ]);
  });

  it("reopens a slot after its booking is cancelled", () => {
    const slots = calculate({
      bookings: [
        {
          startAt: new Date("2026-01-01T02:00:00.000Z"),
          endAt: new Date("2026-01-01T03:00:00.000Z"),
          status: "CANCELLED",
          holdExpiresAt: null,
        },
      ],
    });

    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2026-01-01T02:00:00.000Z",
      "2026-01-01T03:00:00.000Z",
      "2026-01-01T04:00:00.000Z",
    ]);
  });

  it("ignores expired holds and keeps future holds active", () => {
    const slots = calculate({
      bookings: [
        {
          startAt: new Date("2026-01-01T02:00:00.000Z"),
          endAt: new Date("2026-01-01T03:00:00.000Z"),
          status: "WAITING_PAYMENT",
          holdExpiresAt: new Date("2025-12-31T23:59:59.000Z"),
        },
      ],
    });
    expect(slots).toHaveLength(3);

    const activeHoldSlots = calculate({
      bookings: [
        {
          startAt: new Date("2026-01-01T02:00:00.000Z"),
          endAt: new Date("2026-01-01T03:00:00.000Z"),
          status: "WAITING_PAYMENT",
          holdExpiresAt: new Date("2026-01-01T00:00:01.000Z"),
        },
      ],
    });
    expect(activeHoldSlots).toHaveLength(2);
    expect(activeHoldSlots[0].startAt).toEqual(
      new Date("2026-01-01T03:00:00.000Z"),
    );
  });

  it("removes slots partially overlapped by a block and permits adjacent ranges", () => {
    const slots = calculate({
      blocks: [
        {
          startAt: new Date("2026-01-01T02:30:00.000Z"),
          endAt: new Date("2026-01-01T03:30:00.000Z"),
        },
      ],
    });
    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2026-01-01T04:00:00.000Z",
    ]);
  });
});
