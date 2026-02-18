/*
  Warnings:

  - The values [CONFIRM_DATA] on the enum `AgentActionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `activeAgentKey` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the `AgentActionPolicy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AgentActionVariant` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AgentActionType_new" AS ENUM ('REPLY', 'ALERT', 'CAPTURE_DATA', 'COMPLETE', 'TRANSFER', 'VERIFY_EXTERNAL', 'EXECUTE_EXTERNAL', 'ESCALATE');
ALTER TABLE "AgentAction" ALTER COLUMN "actionType" TYPE "AgentActionType_new" USING ("actionType"::text::"AgentActionType_new");
ALTER TABLE "AgentActionLog" ALTER COLUMN "takenAction" TYPE "AgentActionType_new" USING ("takenAction"::text::"AgentActionType_new");
ALTER TYPE "AgentActionType" RENAME TO "AgentActionType_old";
ALTER TYPE "AgentActionType_new" RENAME TO "AgentActionType";
DROP TYPE "public"."AgentActionType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AgentActionPolicy" DROP CONSTRAINT "AgentActionPolicy_actionId_fkey";

-- DropForeignKey
ALTER TABLE "AgentActionVariant" DROP CONSTRAINT "AgentActionVariant_actionId_fkey";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "activeAgentKey";

-- DropTable
DROP TABLE "AgentActionPolicy";

-- DropTable
DROP TABLE "AgentActionVariant";

-- CreateTable
CREATE TABLE "AgentVariant" (
    "variantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" "Platform",
    "channel" "PlatformChannel",
    "overrideConfiguration" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentVariant_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "AgentPolicy" (
    "policyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" "Platform",
    "channel" "PlatformChannel",
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPolicy_pkey" PRIMARY KEY ("policyId")
);

-- AddForeignKey
ALTER TABLE "AgentVariant" ADD CONSTRAINT "AgentVariant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ClientAgent"("agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPolicy" ADD CONSTRAINT "AgentPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ClientAgent"("agentId") ON DELETE RESTRICT ON UPDATE CASCADE;
