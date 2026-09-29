import { env } from "@/lib/env";
import { getSafeCallbackPath } from "@/modules/auth/callback-url";
import { signInWithGoogle } from "@/modules/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackPath = getSafeCallbackPath(
    params.callbackUrl,
    env.APP_URL,
    "/dashboard",
  );
  const googleConfigured = Boolean(
    env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
  );

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Fotiu</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Masuk sebagai customer
        </h1>
        <p className="text-muted-foreground">
          Gunakan akun Google untuk melihat dan mengelola booking Anda.
        </p>
      </div>

      {params.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          Login tidak berhasil. Silakan coba lagi.
        </p>
      )}

      <form action={signInWithGoogle}>
        <input type="hidden" name="callbackUrl" value={callbackPath} />
        <button
          className="h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!googleConfigured}
        >
          Masuk dengan Google
        </button>
      </form>

      {!googleConfigured && (
        <p className="text-sm text-muted-foreground">
          Login Google belum aktif. Atur AUTH_GOOGLE_ID dan AUTH_GOOGLE_SECRET
          di .env.
        </p>
      )}
    </main>
  );
}
