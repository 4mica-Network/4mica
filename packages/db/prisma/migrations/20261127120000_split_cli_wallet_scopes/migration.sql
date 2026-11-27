UPDATE "cli_sessions"
SET "scopes" = array_remove("scopes", 'wallets:write') || ARRAY['wallets:link', 'wallets:unlink']::TEXT[]
WHERE 'wallets:write' = ANY("scopes");

UPDATE "cli_device_requests"
SET "scopes" = array_remove("scopes", 'wallets:write') || ARRAY['wallets:link', 'wallets:unlink']::TEXT[]
WHERE 'wallets:write' = ANY("scopes");
