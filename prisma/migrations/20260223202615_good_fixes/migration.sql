/*
  Warnings:

  - You are about to drop the column `confirmationConfig` on the `ClientPlatform` table. All the data in the column will be lost.
  - Added the required column `platformConfig` to the `ClientPlatform` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientPlatform" DROP COLUMN "confirmationConfig",
ADD COLUMN     "platformConfig" JSONB NOT NULL;
