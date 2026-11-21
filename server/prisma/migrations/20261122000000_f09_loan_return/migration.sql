-- F-09 (SDS 3.2): who returned a loan, when, and the condition note. Existing rows keep NULL.
ALTER TABLE "loan" ADD COLUMN "returned_at" TIMESTAMPTZ(3),
ADD COLUMN "returned_by_id" INTEGER,
ADD COLUMN "return_note" TEXT;

ALTER TABLE "loan" ADD CONSTRAINT "loan_returned_by_id_fkey" FOREIGN KEY ("returned_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
