import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { env } from "../src/lib/env";
import {
  addCalendarDays,
  getLocalDate,
  localDateTimeToUtc,
  weekdayForLocalDate,
} from "../src/modules/scheduling/time";

test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
const token = randomUUID();
const customerId = randomUUID();
const packageId = randomUUID();
const boothId = randomUUID();
const deviceToken = randomBytes(32).toString("base64url");
const bookingIds: string[] = [];
const originalHours = new Map<
  number,
  { isOpen: boolean; openTime: string; closeTime: string } | null
>();
let bookingCode = "";

async function signInCustomer(page: import("@playwright/test").Page) {
  const cookieName = "authjs.session-token";
  const value = await encode({
    token: { sub: customerId, id: customerId, role: "CUSTOMER" },
    secret: env.AUTH_SECRET,
    salt: cookieName,
  });
  await page.context().addCookies([
    {
      name: cookieName,
      value,
      url: "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.beforeAll(async () => {
  await prisma.$connect();
  const today = getLocalDate(new Date(), env.STUDIO_TIMEZONE);
  let sessionDate = addCalendarDays(today, 14);
  if (weekdayForLocalDate(sessionDate) === 0)
    sessionDate = addCalendarDays(sessionDate, 1);
  const weekday = weekdayForLocalDate(sessionDate);
  const existing = await prisma.operatingHour.findUnique({
    where: { weekday },
  });
  originalHours.set(
    weekday,
    existing
      ? {
          isOpen: existing.isOpen,
          openTime: existing.openTime,
          closeTime: existing.closeTime,
        }
      : null,
  );
  await prisma.operatingHour.upsert({
    where: { weekday },
    create: { weekday, isOpen: true, openTime: "09:00", closeTime: "17:00" },
    update: { isOpen: true, openTime: "09:00", closeTime: "17:00" },
  });
  await prisma.user.create({
    data: {
      id: customerId,
      googleSub: `e2e-${token}`,
      email: `e2e-${token}@test.invalid`,
      name: "E2E Customer",
    },
  });
  await prisma.package.create({
    data: {
      id: packageId,
      slug: `e2e-${token}`,
      name: "E2E Studio Session",
      description: "Package fixture untuk E2E.",
      price: 150_000,
      durationMinutes: 30,
      bufferMinutes: 0,
      sortOrder: 0,
    },
  });
  await prisma.booth.create({
    data: {
      id: boothId,
      name: "E2E Mock Booth",
      deviceId: `e2e-${token}`,
      providerKey: "mock",
      agentTokenHash: createHash("sha256").update(deviceToken).digest("hex"),
      lastSeenAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  if (bookingIds.length) {
    await prisma.boothEvent.deleteMany({
      where: { photoSession: { bookingId: { in: bookingIds } } },
    });
    await prisma.boothCommand.deleteMany({
      where: { photoSession: { bookingId: { in: bookingIds } } },
    });
    await prisma.photoSession.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { payment: { bookingId: { in: bookingIds } } },
    });
    await prisma.payment.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }
  await prisma.booth.deleteMany({ where: { id: boothId } });
  await prisma.package.deleteMany({ where: { id: packageId } });
  await prisma.user.deleteMany({ where: { id: customerId } });
  for (const [weekday, hours] of originalHours) {
    if (hours)
      await prisma.operatingHour.upsert({
        where: { weekday },
        create: { weekday, ...hours },
        update: hours,
      });
    else await prisma.operatingHour.deleteMany({ where: { weekday } });
  }
  await prisma.$disconnect();
});

test("customer books a package and sees confirmation after a verified webhook", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInCustomer(page);
  const date = addCalendarDays(
    getLocalDate(new Date(), env.STUDIO_TIMEZONE),
    14,
  );
  const sessionDate =
    weekdayForLocalDate(date) === 0 ? addCalendarDays(date, 1) : date;
  const startAt = localDateTimeToUtc(
    `${sessionDate}T10:00`,
    env.STUDIO_TIMEZONE,
  ).toISOString();
  await page.goto(`/packages/${`e2e-${token}`}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto(
    `/packages/${`e2e-${token}`}/book?startAt=${encodeURIComponent(startAt)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Konfirmasi booking" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Buat booking" }).click();
  const heading = page.getByRole("heading", { name: /Booking FT-/ });
  await expect(heading).toBeVisible();
  bookingCode = (await heading.innerText()).replace("Booking ", "");
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { code: bookingCode },
    select: { id: true, payment: { select: { amount: true } } },
  });
  bookingIds.push(booking.id);
  const statusCode = "200";
  const grossAmount = `${booking.payment?.amount}.00`;
  const transactionId = `e2e-${randomUUID()}`;
  const signatureKey = createHash("sha512")
    .update(`${bookingCode}${statusCode}${grossAmount}e2e-local-webhook-secret`)
    .digest("hex");
  const webhook = await request.post("/api/webhooks/payment", {
    data: {
      order_id: bookingCode,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_id: transactionId,
      transaction_status: "settlement",
      payment_type: "qris",
      fraud_status: "accept",
    },
  });
  expect(webhook.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText("Pembayaran berhasil!")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard customer" }),
  ).toBeVisible();
  await expect(page.getByText(bookingCode)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto("/dashboard/bookings");
  await expect(
    page.getByRole("heading", { name: "Booking saya" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("sandbox payment page shows the QRIS simulator and sandbox QR URL", async ({
  page,
}) => {
  const now = new Date();
  const booking = await prisma.booking.create({
    data: {
      code: `e2e-sandbox-${token}`,
      userId: customerId,
      packageId,
      packageNameSnapshot: "E2E Studio Session",
      priceSnapshot: 150_000,
      startAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      endAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000 + 30 * 60_000),
      holdExpiresAt: new Date(now.getTime() + 10 * 60_000),
      status: "WAITING_PAYMENT",
      payment: {
        create: {
          provider: "midtrans",
          providerOrderId: `e2e-sandbox-${token}`,
          amount: 150_000,
          status: "PENDING",
          qrImageUrl: "https://api.sandbox.midtrans.com/v2/qris/e2e/qr-code",
        },
      },
    },
    select: { id: true },
  });
  bookingIds.push(booking.id);

  await signInCustomer(page);
  await page.goto(`/dashboard/bookings/${booking.id}`);
  await expect(
    page.getByRole("heading", { name: "Tes pembayaran Midtrans Sandbox" }),
  ).toBeVisible();
  await expect(page.getByLabel("URL gambar QR sandbox")).toHaveValue(
    "https://api.sandbox.midtrans.com/v2/qris/e2e/qr-code",
  );
  await expect(
    page.getByRole("link", { name: "Buka simulator QRIS Midtrans" }),
  ).toHaveAttribute(
    "href",
    "https://simulator.sandbox.midtrans.com/openapi/qris/index",
  );
  await expect(page.getByText(/Jangan scan QR sandbox/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("admin checks in, assigns a booth, starts a mock session, and records recovery", async ({
  page,
}) => {
  const now = new Date();
  const booking = await prisma.booking.create({
    data: {
      code: `e2e-admin-${token}`,
      userId: customerId,
      packageId,
      packageNameSnapshot: "E2E Studio Session",
      priceSnapshot: 150_000,
      startAt: new Date(now.getTime() - 5 * 60_000),
      endAt: new Date(now.getTime() + 5 * 60_000),
      status: "CONFIRMED",
      payment: {
        create: {
          provider: "midtrans",
          providerOrderId: `e2e-admin-${token}`,
          amount: 150_000,
          status: "PAID",
          paidAt: now,
        },
      },
    },
    select: { id: true },
  });
  bookingIds.push(booking.id);

  await page.goto("/admin/login");
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Email").fill(process.env.ADMIN_SEED_EMAIL ?? "");
  await page.getByLabel("Password").fill(process.env.ADMIN_SEED_PASSWORD ?? "");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expectNoHorizontalOverflow(page);
  for (const path of [
    "/admin/bookings",
    "/admin/calendar",
    "/admin/customers",
    "/admin/booths",
    "/admin/packages",
    "/admin/schedule",
    "/admin/gallery",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await page.goto(`/admin/bookings/${booking.id}`);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Check-in customer" }).click();
  await expect(page.getByText("Customer berhasil check-in.")).toBeVisible();
  await page.getByLabel("Booth ONLINE").selectOption(boothId);
  await page.getByRole("button", { name: "Assign booth" }).click();
  await expect(
    page.getByText("Booth berhasil di-assign; photo session berstatus READY."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mulai sesi mock" }).click();
  await expect(
    page.getByText("Command START_SESSION sudah masuk antrean agent."),
  ).toBeVisible();
  await page
    .getByLabel("Alasan dan hasil pemeriksaan")
    .fill("Admin memeriksa hasil sesi mock dan mengonfirmasi selesai.");
  await page
    .getByRole("button", { name: "Konfirmasi recovery selesai" })
    .click();
  await expect(
    page.getByText(/Booking diselesaikan melalui manual recovery/),
  ).toBeVisible();
  const completed = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true },
  });
  expect(completed.status).toBe("COMPLETED");
});

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("public and login pages fit a mobile viewport and support keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/gallery", "/packages", "/login"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Lewati ke konten utama" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await skipLink.click();
    await expect(page).toHaveURL(/#main-content$/);
    const heading =
      path === "/"
        ? /Abadikan momen.*sesi foto.*personal\./s
        : path === "/gallery"
          ? "Gallery"
          : path === "/packages"
            ? "Pilih sesi foto Anda"
            : "Masuk sebagai customer";
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toContainText(heading);
    await expectNoHorizontalOverflow(page);
  }
});
