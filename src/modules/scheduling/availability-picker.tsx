"use client";

import { useEffect, useState } from "react";

type Slot = { startAt: string; endAt: string };
type AvailabilityResponse = {
  ok: boolean;
  message?: string;
  slots?: Slot[];
};

type AvailabilityPickerProps = {
  packageId: string;
  packageSlug: string;
  timeZone: string;
  initialDate: string;
  maxDate: string;
};

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function AvailabilityPicker({
  packageId,
  packageSlug,
  timeZone,
  initialDate,
  maxDate,
}: AvailabilityPickerProps) {
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ packageId, date });
    fetch(`/api/availability?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as AvailabilityResponse;
        if (!response.ok || !result.ok || !result.slots) {
          throw new Error(result.message ?? "Jadwal belum dapat dimuat.");
        }
        setSlots(result.slots);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setSlots([]);
        setError(
          cause instanceof Error ? cause.message : "Jadwal belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [date, packageId]);

  return (
    <section
      className="mt-8 rounded-xl border p-5 sm:p-7"
      aria-labelledby="availability-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="availability-heading" className="text-xl font-semibold">
            Pilih tanggal dan waktu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jam studio mengikuti {timeZone}.
          </p>
        </div>
        <label className="text-sm font-medium">
          Tanggal sesi
          <input
            className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm"
            type="date"
            min={initialDate}
            max={maxDate}
            value={date}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setSelectedStartAt(null);
              setDate(event.target.value);
            }}
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground" role="status">
          Memuat slot waktu...
        </p>
      ) : error ? (
        <p
          className="mt-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : slots.length === 0 ? (
        <p
          className="mt-6 rounded-md border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          Tidak ada slot tersedia pada tanggal ini. Coba tanggal lain.
        </p>
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {slots.map((slot) => {
              const selected = selectedStartAt === slot.startAt;
              return (
                <li key={slot.startAt}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setSelectedStartAt(selected ? null : slot.startAt)
                    }
                    className={`w-full rounded-md border px-3 py-3 text-sm font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary hover:bg-primary/5"}`}
                  >
                    <time dateTime={slot.startAt}>
                      {formatTime(slot.startAt, timeZone)}
                    </time>
                    <span className="mt-1 block text-xs font-normal opacity-75">
                      sampai {formatTime(slot.endAt, timeZone)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedStartAt && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary/60 p-4">
              <p className="text-sm" role="status">
                Waktu dipilih: {formatTime(selectedStartAt, timeZone)}
              </p>
              <a
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                href={`/packages/${packageSlug}/book?startAt=${encodeURIComponent(selectedStartAt)}`}
              >
                Lanjutkan booking
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
