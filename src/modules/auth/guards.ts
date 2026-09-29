import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireCustomer() {
  const session = await auth();

  if (!session?.user.id) redirect("/login");
  if (session.user.role !== "CUSTOMER") redirect("/admin");

  return { userId: session.user.id };
}

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user.id || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const admin = await prisma.admin.findFirst({
    where: { id: session.user.id, isActive: true },
    select: { id: true },
  });

  if (!admin) redirect("/admin/login?error=SessionExpired");

  return { adminId: admin.id };
}
