import Link from "next/link";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/modules/auth/guards";
import { getBoothReadStatus } from "@/modules/photobooth/domain";
import {
  BoothCredentialControls,
  CreateBoothForm,
} from "@/modules/photobooth/credential-form";

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

export default async function AdminBoothsPage() {
  await requireAdmin();
  const booths = await prisma.$queryRaw<BoothRow[]>`
    SELECT booth."id", booth."name", booth."deviceId", booth."providerKey",
      booth."isMaintenance", booth."lastSeenAt",
      EXISTS (
        SELECT 1 FROM "photo_sessions" session
        WHERE session."boothId" = booth."id"
          AND session."status" IN ('READY', 'STARTING', 'ACTIVE', 'PROCESSING')
      ) AS "hasActiveSession"
    FROM "booths" booth
    ORDER BY booth."name" ASC, booth."deviceId" ASC
  `;
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        href="/admin"
      >
        ← Dashboard admin
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Photobooth</h1>
      <p className="mt-2 text-muted-foreground">
        Provision perangkat dan pantau koneksi agent.
      </p>
      <section className="mt-8 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Perangkat terdaftar</h2>
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
                  className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={booth.id}
                >
                  <div>
                    <h3 className="font-medium">
                      {booth.name}{" "}
                      <span className="ml-2 rounded-full bg-secondary px-2 py-1 text-xs">
                        {statusLabel[status]}
                      </span>
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Device: {booth.deviceId} · Provider: {booth.providerKey}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Heartbeat:{" "}
                      {booth.lastSeenAt
                    ? booth.lastSeenAt.toLocaleString("id-ID", {
                        timeZone: env.STUDIO_TIMEZONE,
                          })
                        : "Belum pernah tersambung"}
                    </p>
                  </div>
                  <BoothCredentialControls boothId={booth.id} />
                </article>
              );
            })}
          </div>
        )}
      </section>
      <div className="mt-6">
        <CreateBoothForm />
      </div>
    </main>
  );
}
