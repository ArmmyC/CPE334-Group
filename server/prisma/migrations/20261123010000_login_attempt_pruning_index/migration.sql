-- Old login attempts are deleted in small batches, oldest by time, so the delete needs this index.
CREATE INDEX "login_attempt_attempted_at_idx" ON "login_attempt"("attempted_at");
