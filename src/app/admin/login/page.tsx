import { getSafeCallbackPath } from "@/modules/auth/callback-url";
import { env } from "@/lib/env";
import { signInAdmin } from "@/modules/auth/actions";

type AdminLoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const params = await searchParams;
  const callbackPath = getSafeCallbackPath(
    params.callbackUrl,
    env.APP_URL,
    "/admin",
  );

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Fotiu</p>
        <h1 className="text-3xl font-semibold tracking-tight">Login admin</h1>
        <p className="text-muted-foreground">Masuk dengan akun admin studio.</p>
      </div>

      {params.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          Email atau password salah. Silakan coba lagi.
        </p>
      )}

      <form action={signInAdmin} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackPath} />
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            className="h-11 w-full rounded-md border bg-background px-3"
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            className="h-11 w-full rounded-md border bg-background px-3"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button
          className="h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground"
          type="submit"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}
