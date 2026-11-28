ALTER TABLE "spend_authorizations" ADD COLUMN "authorized_amount" DECIMAL(38,18),
ADD COLUMN "settled_amount" DECIMAL(38,18);

UPDATE "spend_authorizations"
   SET "authorized_amount" = "amount"
 WHERE "payment_id" IS NULL
    OR "status" <> 'CONSUMED';

UPDATE "spend_authorizations" AS "a"
   SET "authorized_amount" = ("ar"."payload" ->> 'amount')::DECIMAL(38,18)
  FROM "approval_requests" AS "ar"
 WHERE "a"."authorized_amount" IS NULL
   AND "ar"."id" = "a"."approval_request_id"
   AND "ar"."payload" ->> 'authorizationId' = "a"."id"
   AND "ar"."payload" ->> 'amount' ~ '^[0-9]{1,20}(\.[0-9]{1,18})?$';

UPDATE "spend_authorizations" AS "a"
   SET "authorized_amount" = "a"."amount"
  FROM "payments" AS "p"
 WHERE "a"."authorized_amount" IS NULL
   AND "p"."id" = "a"."payment_id"
   AND "p"."amount" <> "a"."amount";

UPDATE "spend_authorizations" AS "a"
   SET "settled_amount" = "p"."amount"
  FROM "payments" AS "p"
 WHERE "a"."status" = 'CONSUMED'
   AND "p"."id" = "a"."payment_id"
   AND "p"."amount" = "a"."amount";

CREATE FUNCTION "spend_authorizations_amounts_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."authorized_amount" IS NOT NULL
     AND NEW."authorized_amount" IS DISTINCT FROM OLD."authorized_amount" THEN
    RAISE EXCEPTION 'spend_authorizations.authorized_amount is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."settled_amount" IS NOT NULL
     AND NEW."settled_amount" IS DISTINCT FROM OLD."settled_amount" THEN
    RAISE EXCEPTION 'spend_authorizations.settled_amount is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "spend_authorizations_amounts_immutable"
    BEFORE UPDATE ON "spend_authorizations"
    FOR EACH ROW EXECUTE FUNCTION "spend_authorizations_amounts_immutable"();
