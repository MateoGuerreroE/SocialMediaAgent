/*
  Warnings:

  - You are about to drop the column `facebookAccountId` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `instagramAccountId` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappNumber` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the `ClientCredential` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CredentialType" ADD VALUE 'PAGE_TOKEN';
ALTER TYPE "CredentialType" ADD VALUE 'APP_TOKEN';
ALTER TYPE "CredentialType" ADD VALUE 'WHATSAPP_BUCKET';

-- DropForeignKey
ALTER TABLE "ClientCredential" DROP CONSTRAINT "ClientCredential_clientId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "facebookAccountId",
DROP COLUMN "instagramAccountId",
DROP COLUMN "whatsappNumber";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "isConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "ClientCredential";

-- CreateTable
CREATE TABLE "ClientPlatform" (
    "platformId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmQuestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPlatform_pkey" PRIMARY KEY ("platformId")
);

-- CreateTable
CREATE TABLE "PlatformCredential" (
    "credentialId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("credentialId")
);

-- AddForeignKey
ALTER TABLE "ClientPlatform" ADD CONSTRAINT "ClientPlatform_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCredential" ADD CONSTRAINT "PlatformCredential_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "ClientPlatform"("platformId") ON DELETE RESTRICT ON UPDATE CASCADE;
