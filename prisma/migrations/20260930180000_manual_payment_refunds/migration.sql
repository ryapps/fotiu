ALTER TABLE "payments"
  ADD COLUMN "refundedAt" TIMESTAMPTZ(3),
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundedByAdminId" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refundedByAdminId_fkey"
  FOREIGN KEY ("refundedByAdminId") REFERENCES "admins"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refund_audit_check"
  CHECK (
    ("status" = 'REFUNDED' AND "refundedAt" IS NOT NULL AND "refundReason" IS NOT NULL AND "refundedByAdminId" IS NOT NULL)
    OR
    ("status" <> 'REFUNDED' AND "refundedAt" IS NULL AND "refundReason" IS NULL AND "refundedByAdminId" IS NULL)
  );
