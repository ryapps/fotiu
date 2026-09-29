"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { signIn, signOut } from "@/auth";
import { getSafeCallbackPath } from "@/modules/auth/callback-url";
import { adminCredentialsSchema } from "@/modules/auth/admin-credentials";

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInWithGoogle(formData: FormData) {
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
    redirect("/login?error=GoogleNotConfigured");
  }

  const callbackPath = getSafeCallbackPath(
    getFormValue(formData, "callbackUrl"),
    env.APP_URL,
    "/dashboard",
  );

  await signIn("google", { redirectTo: callbackPath });
}

export async function signInAdmin(formData: FormData) {
  const credentials = adminCredentialsSchema.safeParse({
    email: getFormValue(formData, "email"),
    password: getFormValue(formData, "password"),
  });

  if (!credentials.success) redirect("/admin/login?error=CredentialsSignin");

  const callbackPath = getSafeCallbackPath(
    getFormValue(formData, "callbackUrl"),
    env.APP_URL,
    "/admin",
  );

  await signIn("credentials", {
    ...credentials.data,
    redirectTo: callbackPath,
  });
}

export async function signOutCustomer() {
  await signOut({ redirectTo: "/login" });
}

export async function signOutAdmin() {
  await signOut({ redirectTo: "/admin/login" });
}
