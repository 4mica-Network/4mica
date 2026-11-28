ALTER TABLE "spend_authorizations" ADD COLUMN "matched_at" TIMESTAMP(3);

DROP TRIGGER "spend_authorizations_amounts_immutable" ON "spend_authorizations";
DROP FUNCTION "spend_authorizations_amounts_immutable"();

WITH "verified" AS (
    SELECT DISTINCT ON ("a"."organization_id", "a"."payment_id") "a"."id", "p"."amount"
      FROM "spend_authorizations" AS "a"
      JOIN "payments" AS "p" ON "p"."id" = "a"."payment_id"
     WHERE "a"."status" = 'CONSUMED'
       AND "a"."req_id" = "p"."req_id"
       AND "a"."network" = "p"."network"
       AND "a"."asset_address" IS NOT DISTINCT FROM "p"."asset_address"
       AND "a"."payer_address" = "p"."payer_address"
       AND "a"."recipient_address" = "p"."recipient_address"
       AND "p"."amount" <= COALESCE("a"."authorized_amount", "a"."amount")
       AND "p"."status" <> 'FAILED'
     ORDER BY "a"."organization_id", "a"."payment_id", "a"."consumed_at" ASC NULLS LAST, "a"."created_at" ASC, "a"."id" ASC
)
UPDATE "spend_authorizations" AS "a"
   SET "matched_at" = COALESCE("a"."consumed_at", "a"."updated_at"),
       "settled_amount" = "verified"."amount",
       "amount" = "verified"."amount"
  FROM "verified"
 WHERE "a"."id" = "verified"."id";

UPDATE "spend_authorizations"
   SET "payment_id" = NULL,
       "settled_amount" = NULL
 WHERE "matched_at" IS NULL
   AND ("payment_id" IS NOT NULL OR "settled_amount" IS NOT NULL);

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_settlement_check"
    CHECK (("payment_id" IS NULL AND "matched_at" IS NULL AND "settled_amount" IS NULL)
        OR ("payment_id" IS NOT NULL AND "matched_at" IS NOT NULL AND "settled_amount" IS NOT NULL));

CREATE UNIQUE INDEX "spend_authorizations_organization_id_payment_id_key"
    ON "spend_authorizations" ("organization_id", "payment_id")
 WHERE "payment_id" IS NOT NULL;

CREATE FUNCTION "spend_authorizations_settlement_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."authorized_amount" IS NOT NULL
     AND NEW."authorized_amount" IS DISTINCT FROM OLD."authorized_amount" THEN
    RAISE EXCEPTION 'spend_authorizations.authorized_amount is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."payment_id" IS NOT NULL
     AND (NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
          OR NEW."settled_amount" IS DISTINCT FROM OLD."settled_amount"
          OR NEW."matched_at" IS DISTINCT FROM OLD."matched_at") THEN
    RAISE EXCEPTION 'spend_authorizations payment association is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "spend_authorizations_settlement_immutable"
    BEFORE UPDATE ON "spend_authorizations"
    FOR EACH ROW EXECUTE FUNCTION "spend_authorizations_settlement_immutable"();
