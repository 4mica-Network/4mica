-- RemapData
UPDATE "users" SET "default_home" = 'overview' WHERE "default_home" = 'balances';

-- RemapData
UPDATE "users" SET "default_home" = 'payments' WHERE "default_home" = 'transactions';
