"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Kembali
    </button>
  );
}
