ALTER TABLE "spend_authorizations" ADD COLUMN "issued_by_key_id" TEXT,
ADD COLUMN "issued_by_key_prefix" VARCHAR(32),
ADD COLUMN "service_account_id" TEXT;

UPDATE "spend_authorizations" AS "a"
   SET "issued_by_key_id" = "k"."id",
       "issued_by_key_prefix" = "k"."prefix",
       "service_account_id" = "k"."service_account_id"
  FROM "api_keys" AS "k"
 WHERE "k"."id" = "a"."api_key_id";

UPDATE "spend_authorizations" AS "a"
   SET "issued_by_key_id" = "ar"."requested_by_api_key_id"
  FROM "approval_requests" AS "ar"
 WHERE "a"."issued_by_key_id" IS NULL
   AND "ar"."id" = "a"."approval_request_id"
   AND "ar"."requested_by_api_key_id" IS NOT NULL;

UPDATE "spend_authorizations" AS "a"
   SET "issued_by_key_id" = "l"."actor_api_key_id"
  FROM (
    SELECT DISTINCT ON ("target_id") "target_id", "actor_api_key_id"
      FROM "audit_logs"
     WHERE "target_type" = 'spend_authorization'
       AND "action" IN ('spend.denied', 'spend.approval_requested')
       AND "actor_api_key_id" IS NOT NULL
     ORDER BY "target_id", "created_at" ASC, "id" ASC
  ) AS "l"
 WHERE "a"."issued_by_key_id" IS NULL
   AND "l"."target_id" = "a"."id";

CREATE INDEX "spend_authorizations_service_account_id_created_at_idx" ON "spend_authorizations"("service_account_id", "created_at");

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_service_account_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
