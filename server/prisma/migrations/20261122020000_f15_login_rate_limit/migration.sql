-- F-15 (SDS 3.2, 7.3): one row per login attempt that reached the password check.
-- No foreign key: attempts for unknown emails are recorded too.
CREATE TABLE "login_attempt" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempt_email_attempted_at_idx" ON "login_attempt"("email", "attempted_at");
