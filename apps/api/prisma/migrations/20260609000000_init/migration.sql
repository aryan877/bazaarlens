CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');
CREATE TYPE "Merchant" AS ENUM ('amazon', 'flipkart', 'myntra', 'generic');
CREATE TYPE "Verdict" AS ENUM ('buy', 'wait', 'avoid', 'compare', 'unknown');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT,
  "googleSub" TEXT,
  "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSnapshot" (
  "id" TEXT NOT NULL,
  "merchant" "Merchant" NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "priceAmount" DOUBLE PRECISION,
  "priceRaw" TEXT,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER,
  "seller" TEXT,
  "availability" TEXT,
  "delivery" TEXT,
  "returnPolicy" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productSnapshotId" TEXT NOT NULL,
  "intent" JSONB NOT NULL,
  "decision" JSONB NOT NULL,
  "verdict" "Verdict" NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Approval" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "action" JSONB NOT NULL,
  "approved" BOOLEAN NOT NULL,
  "command" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
CREATE INDEX "ProductSnapshot_merchant_createdAt_idx" ON "ProductSnapshot"("merchant", "createdAt");
CREATE INDEX "AgentSession_userId_createdAt_idx" ON "AgentSession"("userId", "createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

ALTER TABLE "AgentSession"
  ADD CONSTRAINT "AgentSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentSession"
  ADD CONSTRAINT "AgentSession_productSnapshotId_fkey"
  FOREIGN KEY ("productSnapshotId") REFERENCES "ProductSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
