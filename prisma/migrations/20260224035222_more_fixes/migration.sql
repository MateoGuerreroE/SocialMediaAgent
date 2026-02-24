/*
  Warnings:

  - You are about to drop the `PlatformCredential` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlatformCredential" DROP CONSTRAINT "PlatformCredential_platformId_fkey";

-- DropTable
DROP TABLE "PlatformCredential";

-- CreateTable
CREATE TABLE "ClientCredential" (
    "credentialId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("credentialId")
);

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
