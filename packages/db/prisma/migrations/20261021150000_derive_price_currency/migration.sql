UPDATE "api_listings" SET "price_currency" = CASE
  WHEN "network" IS NULL THEN NULL
  WHEN "asset_address" IS NULL THEN 'ETH'
  WHEN "network" = 'BASE' AND lower("asset_address") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' THEN 'USDC'
  WHEN "network" = 'BASE_SEPOLIA' AND lower("asset_address") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e' THEN 'USDC'
  WHEN "network" = 'ETHEREUM_SEPOLIA' AND lower("asset_address") = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' THEN 'USDC'
  ELSE "price_currency"
END;

UPDATE "agents" SET "price_currency" = CASE
  WHEN "network" IS NULL THEN NULL
  WHEN "asset_address" IS NULL THEN 'ETH'
  WHEN "network" = 'BASE' AND lower("asset_address") = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' THEN 'USDC'
  WHEN "network" = 'BASE_SEPOLIA' AND lower("asset_address") = '0x036cbd53842c5426634e7929541ec2318f3dcf7e' THEN 'USDC'
  WHEN "network" = 'ETHEREUM_SEPOLIA' AND lower("asset_address") = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' THEN 'USDC'
  ELSE "price_currency"
END;
