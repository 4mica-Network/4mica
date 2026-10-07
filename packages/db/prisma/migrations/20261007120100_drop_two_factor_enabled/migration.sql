-- The flag was client-settable and never enforced anything; Clerk owns MFA.
-- AlterTable
ALTER TABLE "users" DROP COLUMN "two_factor_enabled";
