-- DropIndex
DROP INDEX "app_user_username_key";

-- CreateIndex
CREATE INDEX "app_user_username_idx" ON "app_user"("username");
