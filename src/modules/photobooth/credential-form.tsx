"use client";

import { useActionState } from "react";
import {
  manageBoothCredentialAction,
  type BoothCredentialActionState,
} from "@/modules/photobooth/admin-actions";

const initialState: BoothCredentialActionState = {};
const inputClass =
  "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm";

function Result({ state }: { state: BoothCredentialActionState }) {
  if (!state.message && !state.error) return null;
  return (
    <div
      className={`mt-3 rounded-md border p-3 text-sm ${state.error ? "border-destructive/50 text-destructive" : "border-primary/30"}`}
      role={state.error ? "alert" : "status"}
    >
      <p>{state.error ?? state.message}</p>
      {state.token && (
        <>
          <p className="mt-2">
            Device: <strong>{state.deviceId}</strong>
          </p>
          <code className="mt-2 block break-all rounded bg-muted p-2 font-mono">
            {state.token}
          </code>
        </>
      )}
    </div>
  );
}

export function CreateBoothForm() {
  const [state, action, pending] = useActionState(
    manageBoothCredentialAction,
    initialState,
  );
  return (
    <section className="rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Provision booth</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Token rahasia hanya muncul sekali setelah dibuat.
      </p>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="operation" value="create" />
        <label className="text-sm">
          Nama
          <input className={inputClass} name="name" maxLength={80} required />
        </label>
        <label className="text-sm">
          Device ID
          <input
            className={inputClass}
            name="deviceId"
            pattern="[A-Za-z0-9_-]{1,128}"
            maxLength={128}
            required
          />
        </label>
        <input type="hidden" name="providerKey" value="mock" />
        <div className="sm:col-span-2">
          <button
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? "Membuat…" : "Buat booth"}
          </button>
          <Result state={state} />
        </div>
      </form>
    </section>
  );
}

export function BoothCredentialControls({ boothId }: { boothId: string }) {
  const [state, action, pending] = useActionState(
    manageBoothCredentialAction,
    initialState,
  );
  return (
    <div className="flex flex-wrap gap-2">
      <form action={action}>
        <input type="hidden" name="operation" value="rotate" />
        <input type="hidden" name="boothId" value={boothId} />
        <button
          className="rounded-md border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          Rotasi token
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="operation" value="revoke" />
        <input type="hidden" name="boothId" value={boothId} />
        <button
          className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          Cabut token
        </button>
      </form>
      <Result state={state} />
    </div>
  );
}
