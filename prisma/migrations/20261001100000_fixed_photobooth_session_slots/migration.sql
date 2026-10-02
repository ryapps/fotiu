-- New package slots use a fixed 10-minute session and a 2-minute turnaround.
-- Existing bookings retain their stored startAt/endAt history.
UPDATE "packages"
SET "durationMinutes" = 10,
    "bufferMinutes" = 2;
