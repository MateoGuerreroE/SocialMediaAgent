/*
  Warnings:

  - You are about to drop the column `deletedBy` on the `ConversationMessage` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentActionType" ADD VALUE 'COMPLETE';
ALTER TYPE "AgentActionType" ADD VALUE 'TRANSFER';
ALTER TYPE "AgentActionType" ADD VALUE 'VERIFY_EXTERNAL';
ALTER TYPE "AgentActionType" ADD VALUE 'EXECUTE_EXTERNAL';
ALTER TYPE "AgentActionType" ADD VALUE 'ESCALATE';

-- AlterEnum
ALTER TYPE "AgentKey" ADD VALUE 'BOOKING_MANAGER';

-- AlterTable
ALTER TABLE "ConversationMessage" DROP COLUMN "deletedBy";

-- AddForeignKey
ALTER TABLE "ClientAgent" ADD CONSTRAINT "ClientAgent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
