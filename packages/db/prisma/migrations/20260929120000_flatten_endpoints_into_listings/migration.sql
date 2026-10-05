ALTER TABLE "api_listings" RENAME COLUMN "base_url" TO "url";

ALTER TABLE "api_listings" ADD COLUMN "method" "HttpMethod" NOT NULL DEFAULT 'GET';

WITH first_endpoint AS (
    SELECT DISTINCT ON ("listing_id") "id"
    FROM "api_endpoints"
    ORDER BY "listing_id", "sort_order" ASC, "path" ASC, "id" ASC
),
extra AS (
    SELECT
        e."id"            AS ep_id,
        e."method"        AS ep_method,
        e."path"          AS ep_path,
        e."summary"       AS ep_summary,
        e."price_amount"  AS ep_price,
        e."sort_order"    AS ep_order,
        l."owner_id"      AS owner_id,
        l."slug"          AS parent_slug,
        l."name"          AS parent_name,
        l."summary"       AS parent_summary,
        l."description"   AS description,
        l."url"           AS parent_url,
        l."docs_url"      AS docs_url,
        l."category"      AS category,
        l."tags"          AS tags,
        l."price_label"   AS price_label,
        l."visibility"    AS visibility,
        l."published_at"  AS published_at,
        l."wallet_id"     AS wallet_id,
        l."network"       AS network,
        l."pay_to_address" AS pay_to_address,
        l."asset_address" AS asset_address,
        l."price_amount"  AS parent_price,
        l."price_currency" AS price_currency,
        l."x402_endpoint" AS x402_endpoint,
        l."created_at"    AS created_at,
        l."deleted_at"    AS deleted_at,
        left(
            l."slug" || '-' || COALESCE(
                NULLIF(trim(BOTH '-' FROM regexp_replace(lower(e."path"), '[^a-z0-9]+', '-', 'g')), ''),
                'route'
            ),
            64
        ) AS base_slug
    FROM "api_endpoints" AS e
    JOIN "api_listings" AS l ON l."id" = e."listing_id"
    WHERE e."id" NOT IN (SELECT "id" FROM first_endpoint)
),
numbered AS (
    SELECT extra.*,
        row_number() OVER (
            PARTITION BY extra.owner_id, extra.base_slug
            ORDER BY extra.ep_order, extra.ep_id
        ) AS dup
    FROM extra
)
INSERT INTO "api_listings" (
    "id", "owner_id", "slug", "name", "summary", "description", "url", "method",
    "docs_url", "category", "tags", "price_label", "visibility", "published_at",
    "wallet_id", "network", "pay_to_address", "asset_address",
    "price_amount", "price_currency", "x402_endpoint",
    "created_at", "updated_at", "deleted_at"
)
SELECT
    gen_random_uuid()::text,
    n.owner_id,
    CASE
        WHEN n.dup = 1 AND NOT EXISTS (
            SELECT 1 FROM "api_listings" x
            WHERE x."owner_id" = n.owner_id AND x."slug" = n.base_slug
        ) THEN n.base_slug
        ELSE left(n.base_slug, 58) || '-' || n.dup::text
    END,
    left(n.parent_name || ' · ' || COALESCE(NULLIF(ltrim(n.ep_path, '/'), ''), 'route'), 120),
    COALESCE(n.ep_summary, n.parent_summary),
    n.description,
    CASE
        WHEN n.parent_url IS NULL THEN NULL
        WHEN COALESCE(n.ep_path, '') IN ('', '/') THEN n.parent_url
        ELSE rtrim(n.parent_url, '/') || '/' || ltrim(n.ep_path, '/')
    END,
    n.ep_method,
    n.docs_url,
    n.category,
    n.tags,
    n.price_label,
    n.visibility,
    n.published_at,
    n.wallet_id,
    n.network,
    n.pay_to_address,
    n.asset_address,
    COALESCE(n.ep_price, n.parent_price),
    n.price_currency,
    n.x402_endpoint,
    n.created_at,
    now(),
    n.deleted_at
FROM numbered AS n;

WITH first_endpoint AS (
    SELECT DISTINCT ON ("listing_id")
        "listing_id", "id", "method", "path", "summary", "price_amount"
    FROM "api_endpoints"
    ORDER BY "listing_id", "sort_order" ASC, "path" ASC, "id" ASC
)
UPDATE "api_listings" AS l
SET "method" = f."method",
    "url" = CASE
        WHEN l."url" IS NULL THEN NULL
        WHEN COALESCE(f."path", '') IN ('', '/') THEN l."url"
        ELSE rtrim(l."url", '/') || '/' || ltrim(f."path", '/')
    END,
    "price_amount" = COALESCE(f."price_amount", l."price_amount"),
    "summary" = COALESCE(l."summary", f."summary")
FROM first_endpoint AS f
WHERE f."listing_id" = l."id";

DROP TABLE "api_endpoints";
