import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { authorizeAdmin } from "@/modules/auth/admin-credentials";
import { requireAdmin, requireCustomer } from "@/modules/auth/guards";
import { upsertCustomerFromGoogleProfile } from "@/modules/auth/google-profile";

const token = randomUUID();
const activeAdminEmail = `admin-${token}@fotiu.test`;
const inactiveAdminEmail = `inactive-${token}@fotiu.test`;
const limitedAdminEmail = `limited-${token}@fotiu.test`;
const unknownAdminEmail = `unknown-${token}@fotiu.test`;
const googleSub = `google-${token}`;

let activeAdminId: string;
let inactiveAdminId: string;
let customerId: string;
let activeAdminPasswordHash: string;

function rateLimitKey(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

describe("authentication and authorization", () => {
  beforeAll(async () => {
    await prisma.$connect();
    activeAdminPasswordHash = await bcrypt.hash("integration-password", 4);

    const activeAdmin = await prisma.admin.create({
      data: {
        email: activeAdminEmail,
        passwordHash: activeAdminPasswordHash,
        name: "Active Integration Admin",
      },
    });
    activeAdminId = activeAdmin.id;

    const inactiveAdmin = await prisma.admin.create({
      data: {
        email: inactiveAdminEmail,
        passwordHash: activeAdminPasswordHash,
        name: "Inactive Integration Admin",
        isActive: false,
      },
    });
    inactiveAdminId = inactiveAdmin.id;
  });

  afterAll(async () => {
    const keys = [
      activeAdminEmail,
      inactiveAdminEmail,
      limitedAdminEmail,
      unknownAdminEmail,
    ].map((email) => rateLimitKey(email.toLowerCase()));
    await prisma.adminLoginAttempt.deleteMany({ where: { key: { in: keys } } });
    await prisma.admin.deleteMany({
      where: { id: { in: [activeAdminId, inactiveAdminId] } },
    });
    if (customerId) await prisma.user.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("upserts verified Google customers without creating duplicates", async () => {
    const profile = {
      sub: googleSub,
      email: `Customer-${token}@example.test`,
      email_verified: true,
      name: "First Name",
      picture: "https://images.example.test/avatar.png",
    };

    const first = await upsertCustomerFromGoogleProfile(profile);
    const second = await upsertCustomerFromGoogleProfile({
      ...profile,
      name: "Updated Name",
    });

    expect(first).not.toBeNull();
    expect(second?.id).toBe(first?.id);
    expect(second?.name).toBe("Updated Name");
    expect(await prisma.user.count({ where: { googleSub } })).toBe(1);
    customerId = first!.id;
  });

  it("rejects Google profiles with unverified email", async () => {
    await expect(
      upsertCustomerFromGoogleProfile({
        sub: `${googleSub}-unverified`,
        email: `unverified-${token}@example.test`,
        email_verified: false,
      }),
    ).resolves.toBeNull();
  });

  it("accepts valid admin credentials and rejects wrong or inactive credentials", async () => {
    await expect(
      authorizeAdmin({
        email: activeAdminEmail,
        password: "integration-password",
      }),
    ).resolves.toMatchObject({ id: activeAdminId, role: "ADMIN" });

    await expect(
      authorizeAdmin({ email: activeAdminEmail, password: "wrong-password" }),
    ).resolves.toBeNull();
    await expect(
      authorizeAdmin({
        email: inactiveAdminEmail,
        password: "integration-password",
      }),
    ).resolves.toBeNull();
    await expect(
      authorizeAdmin({
        email: unknownAdminEmail,
        password: "wrong-password",
      }),
    ).resolves.toBeNull();
  });

  it("rate limits repeated admin login failures", async () => {
    await prisma.admin.create({
      data: {
        email: limitedAdminEmail,
        passwordHash: activeAdminPasswordHash,
        name: "Rate Limited Integration Admin",
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        authorizeAdmin({
          email: limitedAdminEmail,
          password: "wrong-password",
        }),
      ).resolves.toBeNull();
    }

    await expect(
      authorizeAdmin({
        email: limitedAdminEmail,
        password: "integration-password",
      }),
    ).resolves.toBeNull();
  });

  it("enforces customer and admin guards against the signed session and database state", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireCustomer()).rejects.toThrow("REDIRECT:/login");

    mocks.auth.mockResolvedValue({
      user: { id: activeAdminId, role: "ADMIN" },
    });
    await expect(requireCustomer()).rejects.toThrow("REDIRECT:/admin");
    await expect(requireAdmin()).resolves.toEqual({ adminId: activeAdminId });

    mocks.auth.mockResolvedValue({
      user: { id: activeAdminId, role: "CUSTOMER" },
    });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");

    mocks.auth.mockResolvedValue({
      user: { id: inactiveAdminId, role: "ADMIN" },
    });
    await expect(requireAdmin()).rejects.toThrow(
      "REDIRECT:/admin/login?error=SessionExpired",
    );

    mocks.auth.mockResolvedValue({
      user: { id: customerId, role: "CUSTOMER" },
    });
    await expect(requireCustomer()).resolves.toEqual({ userId: customerId });
  });
});
