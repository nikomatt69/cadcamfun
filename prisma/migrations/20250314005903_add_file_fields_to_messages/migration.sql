-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "fileUrl" TEXT;

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
