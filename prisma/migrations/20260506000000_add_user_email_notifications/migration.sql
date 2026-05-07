-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifyOverdue" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyDueSoon" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyQuoteExpiring" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
