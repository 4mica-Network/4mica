ALTER TABLE "spend_authorizations" ADD COLUMN "req_id_conflict" VARCHAR(64);

WITH "ranked" AS (
    SELECT "id",
           ROW_NUMBER() OVER (
               PARTITION BY "organization_id", "network", COALESCE("asset_address", ''), "req_id"
               ORDER BY ("status" = 'CONSUMED') DESC, "created_at" ASC, "id" ASC
           ) AS "position"
      FROM "spend_authorizations"
     WHERE "req_id" IS NOT NULL
       AND "status" IN ('RESERVED', 'PENDING_APPROVAL', 'CONSUMED')
), "superseded" AS (
    UPDATE "spend_authorizations" AS "s"
       SET "req_id_conflict" = 'duplicate_req_id',
           "status" = CASE WHEN "s"."status" = 'CONSUMED'
                           THEN "s"."status"
                           ELSE 'RELEASED'::"SpendAuthorizationStatus" END,
           "updated_at" = CURRENT_TIMESTAMP
      FROM "ranked" AS "r"
     WHERE "r"."id" = "s"."id"
       AND "r"."position" > 1
 RETURNING "s"."approval_request_id"
)
UPDATE "approval_requests" AS "ar"
   SET "status" = 'CANCELLED',
       "decided_at" = CURRENT_TIMESTAMP,
       "updated_at" = CURRENT_TIMESTAMP
  FROM "superseded"
 WHERE "ar"."id" = "superseded"."approval_request_id"
   AND "ar"."status" = 'PENDING';

CREATE UNIQUE INDEX "spend_authorizations_live_req_id_key"
    ON "spend_authorizations" ("organization_id", "network", COALESCE("asset_address", ''), "req_id")
 WHERE "req_id" IS NOT NULL
   AND "req_id_conflict" IS NULL
   AND "status" IN ('RESERVED', 'PENDING_APPROVAL', 'CONSUMED');
