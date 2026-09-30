"use client";

import { Button } from "@/components/ui/button";
import { cancelMyBookingAction } from "@/modules/booking/actions";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  return (
    <form
      action={cancelMyBookingAction}
      onSubmit={(event) => {
        if (!window.confirm("Yakin ingin membatalkan booking ini?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="destructive">
        Batalkan booking
      </Button>
    </form>
  );
}
