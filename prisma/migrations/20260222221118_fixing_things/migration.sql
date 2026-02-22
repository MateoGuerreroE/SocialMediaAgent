-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "isConfirmed" DROP NOT NULL,
ALTER COLUMN "isConfirmed" DROP DEFAULT;
