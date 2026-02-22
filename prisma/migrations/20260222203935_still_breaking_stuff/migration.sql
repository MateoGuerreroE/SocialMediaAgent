/*
  Warnings:

  - You are about to drop the column `metadata` on the `AgentLog` table. All the data in the column will be lost.
  - You are about to drop the column `confirmQuestion` on the `ClientPlatform` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentLog" DROP COLUMN "metadata";

-- AlterTable
ALTER TABLE "ClientPlatform" DROP COLUMN "confirmQuestion",
ADD COLUMN     "confirmationConfig" JSONB;
