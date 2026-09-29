import { z } from "zod";
import { prisma } from "@/lib/prisma";

const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().nullable().optional(),
  picture: z.url().nullable().optional(),
});

export async function upsertCustomerFromGoogleProfile(profile: unknown) {
  const parsed = googleProfileSchema.safeParse(profile);

  if (!parsed.success || !parsed.data.email_verified) return null;

  const email = parsed.data.email.trim().toLowerCase();

  return prisma.user.upsert({
    where: { googleSub: parsed.data.sub },
    create: {
      googleSub: parsed.data.sub,
      email,
      name: parsed.data.name?.trim() || email.split("@")[0],
      image: parsed.data.picture ?? null,
    },
    update: {
      email,
      name: parsed.data.name?.trim() || email.split("@")[0],
      image: parsed.data.picture ?? null,
    },
  });
}
