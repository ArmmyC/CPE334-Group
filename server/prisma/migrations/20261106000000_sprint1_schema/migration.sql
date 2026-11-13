-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BORROWER', 'CUSTODIAN');

-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'IN_MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- CreateEnum
CREATE TYPE "HistoryEntityType" AS ENUM ('REQUEST', 'LOAN', 'COPY');

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_assignment" (
    "lab_id" INTEGER NOT NULL,
    "custodian_id" INTEGER NOT NULL,

    CONSTRAINT "lab_assignment_pkey" PRIMARY KEY ("lab_id","custodian_id")
);

-- CreateTable
CREATE TABLE "equipment_type" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "loan_period_days" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "equipment_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy" (
    "id" SERIAL NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "status" "CopyStatus" NOT NULL,

    CONSTRAINT "copy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrow_request" (
    "id" SERIAL NOT NULL,
    "borrower_id" INTEGER NOT NULL,
    "equipment_type_id" INTEGER NOT NULL,
    "purpose" VARCHAR(500),
    "status" "RequestStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" INTEGER,

    CONSTRAINT "borrow_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "copy_id" INTEGER NOT NULL,
    "borrower_id" INTEGER NOT NULL,
    "checked_out_at" TIMESTAMPTZ(3) NOT NULL,
    "checked_out_by_id" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "LoanStatus" NOT NULL,

    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" SERIAL NOT NULL,
    "entity_type" "HistoryEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_name_key" ON "lab"("name");

-- CreateIndex
CREATE INDEX "lab_assignment_custodian_id_idx" ON "lab_assignment"("custodian_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_type_lab_id_name_key" ON "equipment_type"("lab_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "copy_asset_tag_key" ON "copy"("asset_tag");

-- CreateIndex
CREATE INDEX "copy_equipment_type_id_status_idx" ON "copy"("equipment_type_id", "status");

-- CreateIndex
CREATE INDEX "borrow_request_borrower_id_status_idx" ON "borrow_request"("borrower_id", "status");

-- CreateIndex
CREATE INDEX "borrow_request_equipment_type_id_status_created_at_idx" ON "borrow_request"("equipment_type_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loan_request_id_key" ON "loan"("request_id");

-- CreateIndex
CREATE INDEX "loan_copy_id_idx" ON "loan"("copy_id");

-- CreateIndex
CREATE INDEX "loan_borrower_id_status_idx" ON "loan"("borrower_id", "status");

-- CreateIndex
CREATE INDEX "status_history_entity_type_entity_id_idx" ON "status_history"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "status_history_lab_id_created_at_idx" ON "status_history"("lab_id", "created_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_assignment" ADD CONSTRAINT "lab_assignment_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_assignment" ADD CONSTRAINT "lab_assignment_custodian_id_fkey" FOREIGN KEY ("custodian_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_type" ADD CONSTRAINT "equipment_type_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy" ADD CONSTRAINT "copy_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_request" ADD CONSTRAINT "borrow_request_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_request" ADD CONSTRAINT "borrow_request_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_request" ADD CONSTRAINT "borrow_request_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "borrow_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_checked_out_by_id_fkey" FOREIGN KEY ("checked_out_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints that Prisma cannot express (SDS section 3.5). Prisma does not track them,
-- so a later migration must not drop or recreate them. TEST-SR03-02 and TEST-SR03-04 fail if one goes missing.

-- BR-05: loan periods are 1 to 30 days.
ALTER TABLE "equipment_type" ADD CONSTRAINT "equipment_type_loan_period_days_check" CHECK ("loan_period_days" BETWEEN 1 AND 30);

-- SDS 3.2: emails are stored lower-case, so the unique index is case-insensitive in practice.
ALTER TABLE "user" ADD CONSTRAINT "user_email_lower_case_check" CHECK ("email" = lower("email"));

-- BR-01: at most one active loan per copy, also under concurrent checkout.
CREATE UNIQUE INDEX "loan_one_active_per_copy" ON "loan"("copy_id") WHERE "status" = 'ACTIVE';

-- BR-04: at most one Pending request per borrower and equipment type.
-- The active-loan half of BR-04 spans two tables and is enforced by the request service (F-03).
CREATE UNIQUE INDEX "borrow_request_one_pending_per_borrower_type" ON "borrow_request"("borrower_id", "equipment_type_id") WHERE "status" = 'PENDING';
