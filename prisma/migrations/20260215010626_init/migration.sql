-- CreateEnum
CREATE TYPE "PlatformChannel" AS ENUM ('DIRECT_MESSAGE', 'COMMENT');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('DIRECT', 'AD');

-- CreateEnum
CREATE TYPE "OriginalContentType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "AgentActionType" AS ENUM ('REPLY', 'CONFIRM_DATA', 'CAPTURE_DATA', 'ALERT');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ApplicationActor" AS ENUM ('USER', 'AGENT');

-- CreateEnum
CREATE TYPE "AgentKey" AS ENUM ('COMMUNITY_MANAGER', 'CRM_INTEGRATION');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('STARTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PAGE_ACCESS_TOKEN', 'APP_ACCESS_TOKEN', 'WHATSAPP_S3_BUCKET');

-- CreateTable
CREATE TABLE "Conversation" (
    "conversationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "activeAgentSessionId" TEXT,
    "platform" "Platform" NOT NULL,
    "channel" "PlatformChannel" NOT NULL,
    "commentSourceId" TEXT,
    "senderId" TEXT NOT NULL,
    "postId" TEXT,
    "parentId" TEXT,
    "senderUsername" TEXT,
    "pausedUntil" TIMESTAMP(3),
    "activeAgentKey" "AgentKey",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalContentType" "OriginalContentType" NOT NULL,
    "originalSourceUrl" TEXT,
    "externalId" TEXT NOT NULL,
    "sentBy" "ApplicationActor" NOT NULL,
    "source" "MessageSource" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentSessionId" TEXT,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "Client" (
    "clientId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessLocation" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "businessDescription" TEXT NOT NULL,
    "businessHours" TEXT NOT NULL,
    "contactOptions" TEXT NOT NULL,
    "dynamicInformation" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "instagramAccountId" TEXT,
    "facebookAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "ClientCredential" (
    "clientCredentialId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("clientCredentialId")
);

-- CreateTable
CREATE TABLE "ClientEvent" (
    "eventId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "ClientAgent" (
    "agentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "name" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgent_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "logId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decisionScore" DOUBLE PRECISION NOT NULL,
    "conversationId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("logId")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "actionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "actionType" "AgentActionType" NOT NULL,
    "useCase" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("actionId")
);

-- CreateTable
CREATE TABLE "AgentActionVariant" (
    "variantId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" "Platform",
    "channel" "PlatformChannel",
    "overrideConfiguration" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentActionVariant_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "AgentActionPolicy" (
    "policyId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" "Platform",
    "channel" "PlatformChannel",
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentActionPolicy_pkey" PRIMARY KEY ("policyId")
);

-- CreateTable
CREATE TABLE "AgentActionLog" (
    "logId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "takenAction" "AgentActionType" NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "reason" TEXT NOT NULL,
    "actionScore" DOUBLE PRECISION NOT NULL,
    "actionTakenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActionLog_pkey" PRIMARY KEY ("logId")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentKey" "AgentKey" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "AgentSessionStatus" NOT NULL,
    "summary" TEXT,
    "conversationId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_activeAgentSessionId_fkey" FOREIGN KEY ("activeAgentSessionId") REFERENCES "AgentSession"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("conversationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEvent" ADD CONSTRAINT "ClientEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActionVariant" ADD CONSTRAINT "AgentActionVariant_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AgentAction"("actionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActionPolicy" ADD CONSTRAINT "AgentActionPolicy_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AgentAction"("actionId") ON DELETE RESTRICT ON UPDATE CASCADE;
