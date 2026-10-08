-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "coupon_code" VARCHAR(64),
ADD COLUMN     "credit_applied" DECIMAL(38,18),
ADD COLUMN     "redeemed_at" TIMESTAMP(3);
