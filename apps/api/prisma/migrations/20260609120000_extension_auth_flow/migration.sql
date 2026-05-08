CREATE TABLE "ExtensionAuthFlow" (
  "id" TEXT NOT NULL,
  "userCode" TEXT NOT NULL,
  "pollTokenHash" TEXT NOT NULL,
  "userId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtensionAuthFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionAuthFlow_pollTokenHash_key" ON "ExtensionAuthFlow"("pollTokenHash");
CREATE INDEX "ExtensionAuthFlow_expiresAt_idx" ON "ExtensionAuthFlow"("expiresAt");
CREATE INDEX "ExtensionAuthFlow_userId_createdAt_idx" ON "ExtensionAuthFlow"("userId", "createdAt");

ALTER TABLE "ExtensionAuthFlow"
  ADD CONSTRAINT "ExtensionAuthFlow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
