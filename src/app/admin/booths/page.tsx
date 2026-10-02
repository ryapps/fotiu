import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import {
  BoothCredentialControls,
  BoothMaintenanceControl,
  CreateBoothForm,
} from "@/modules/photobooth/credential-form";
import { getBoothReadStatus } from "@/modules/photobooth/domain";
import Link from "next/link";

type BoothRow = {
  id: string;
  name: string;
  deviceId: string;
  providerKey: string;
  isMaintenance: boolean;
  lastSeenAt: Date | null;
  hasActiveSession: boolean;
};

const statusLabel = {
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
  BUSY: "Busy",
  ONLINE: "Online",
} as const;

export default async function AdminBoothsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; maintenance?: string }>;
}) {
  await requireAdmin();
  const [params, booths] = await Promise.all([
    searchParams,
    prisma.$queryRaw<BoothRow[]>`
    SELECT booth."id", booth."name", booth."deviceId", booth."providerKey",
      booth."isMaintenance", booth."lastSeenAt",
      EXISTS (
        SELECT 1 FROM "photo_sessions" session
        WHERE session."boothId" = booth."id"
          AND session."status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
      ) AS "hasActiveSession"
    FROM "booths" booth
    ORDER BY booth."name" ASC, booth."deviceId" ASC
  `,
  ]);
  const errors: Record<string, string> = {
    invalid_input: "Input maintenance tidak valid.",
    maintenance_not_found: "Booth tidak ditemukan.",
    maintenance_session_active:
      "Maintenance tidak dapat diakhiri saat masih ada photo session aktif.",
  };
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-[#eef6ff] via-white to-[#eaf2ff] p-6 shadow-[0_20px_54px_rgba(40,80,150,0.07)] sm:p-8">
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Perangkat lokal
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Photobooth
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Provision perangkat dan pantau koneksi agent.
        </p>
      </header>
      {params.error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          {errors[params.error] ?? "Perubahan booth gagal."}
        </p>
      )}
      {params.maintenance && (
        <p
          role="status"
          className="mt-4 rounded-md border border-primary/30 p-3 text-sm"
        >
          Status maintenance diperbarui.
        </p>
      )}
      <section className="mt-8 rounded-2xl border border-primary/10 bg-white/80 p-5 shadow-[0_12px_28px_rgba(37,74,138,0.04)] sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Perangkat terdaftar</h2>
          <span className="text-sm text-muted-foreground">
            {booths.length} perangkat
          </span>
        </div>
        {booths.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Belum ada booth.</p>
        ) : (
          <div className="mt-4 divide-y">
            {booths.map((booth) => {
              const status = getBoothReadStatus({
                isMaintenance: booth.isMaintenance,
                lastSeenAt: booth.lastSeenAt,
                hasActiveSession: booth.hasActiveSession,
                now,
                heartbeatTimeoutSeconds: env.BOOTH_HEARTBEAT_TIMEOUT_SECONDS,
              });
              return (
                <article
                  className="grid gap-4 border-b border-border/70 py-5 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={booth.id}
                >
                  <div>
                    <h3 className="font-medium">
                      {booth.name}{" "}
                      <span className="ml-2 rounded-full bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
                        {statusLabel[status]}
                      </span>
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Device: {booth.deviceId} · Provider: {booth.providerKey}
                    </p>
                    {booth.providerKey === "freebooth" && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Operator menjalankan sesi FreeBooth secara lokal. Agent
                        hanya mengirim heartbeat; mulai dan selesai sesi dicatat
                        admin setelah diperiksa.
                      </p>
                    )}
                    {booth.providerKey === "photobooth_app" && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Agent mengirim trigger ke Photobooth-App lokal dan
                        menerima lifecycle callback dari Commander.
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Heartbeat:{" "}
                      {booth.lastSeenAt
                        ? booth.lastSeenAt.toLocaleString("id-ID", {
                            timeZone: env.STUDIO_TIMEZONE,
                          })
                        : "Belum pernah tersambung"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <BoothMaintenanceControl
                      boothId={booth.id}
                      isMaintenance={booth.isMaintenance}
                    />
                    <BoothCredentialControls
                      boothId={booth.id}
                      providerKey={booth.providerKey}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {booths.length === 0 ? (
        <div className="mt-6">
          <CreateBoothForm />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          P0 mendukung satu booth; dukungan multi-booth berada di luar MVP.
        </p>
      )}
    </main>
  );
}
