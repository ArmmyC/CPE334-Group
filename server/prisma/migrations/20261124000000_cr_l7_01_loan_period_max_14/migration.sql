-- CR-L7-01 (BR-05): the maximum loan period drops from 30 to 14 days.
-- Types set to 15 to 30 days are lowered to 14 first, so the new check can be added. Loans and
-- history are not touched: a loan keeps the due date it was given at checkout.
UPDATE "equipment_type" SET "loan_period_days" = 14 WHERE "loan_period_days" > 14;
ALTER TABLE "equipment_type" DROP CONSTRAINT "equipment_type_loan_period_days_check";
ALTER TABLE "equipment_type" ADD CONSTRAINT "equipment_type_loan_period_days_check" CHECK ("loan_period_days" BETWEEN 1 AND 14);
