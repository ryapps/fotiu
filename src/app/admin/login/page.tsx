import { env } from "@/lib/env";
import { signInAdmin } from "@/modules/auth/actions";
import { getSafeCallbackPath } from "@/modules/auth/callback-url";

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
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <section className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-7 shadow-[0_24px_64px_rgba(40,80,150,0.09)] sm:p-9">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Fotiu · Admin
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Login admin</h1>
          <p className="text-sm text-muted-foreground">
            Masuk dengan akun admin studio.
          </p>
        </div>

        {params.error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            Email atau password salah. Silakan coba lagi.
          </p>
        )}

        <form action={signInAdmin} className="mt-6 space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackPath} />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              className="h-11 w-full rounded-lg border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="h-11 w-full rounded-lg border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            className="h-11 w-full rounded-full bg-primary px-4 font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            type="submit"
          >
            Masuk
          </button>
        </form>
      </section>
    </main>
  );
}
