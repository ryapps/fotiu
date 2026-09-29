-- Keep the payment amount equal to its immutable booking price snapshot.
CREATE FUNCTION enforce_payment_amount_matches_booking_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  booking_price INTEGER;
BEGIN
  SELECT "priceSnapshot"
    INTO booking_price
    FROM "bookings"
    WHERE "id" = NEW."bookingId"
    FOR SHARE;

  -- Let the foreign key report an unknown booking.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW."amount" IS DISTINCT FROM booking_price THEN
    RAISE EXCEPTION 'Payment amount must match the booking price snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'payments_amount_matches_booking_snapshot';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_amount_matches_booking_snapshot_trigger"
BEFORE INSERT OR UPDATE OF "bookingId", "amount" ON "payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_amount_matches_booking_snapshot();

CREATE FUNCTION prevent_booking_price_snapshot_change_after_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."priceSnapshot" IS DISTINCT FROM OLD."priceSnapshot"
    AND EXISTS (SELECT 1 FROM "payments" WHERE "bookingId" = OLD."id") THEN
    RAISE EXCEPTION 'Booking price snapshot cannot change after payment exists'
      USING ERRCODE = '23514', CONSTRAINT = 'booking_price_snapshot_immutable_after_payment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "booking_price_snapshot_immutable_after_payment_trigger"
BEFORE UPDATE OF "priceSnapshot" ON "bookings"
FOR EACH ROW
EXECUTE FUNCTION prevent_booking_price_snapshot_change_after_payment();
