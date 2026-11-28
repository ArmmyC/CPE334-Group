-- F-08 (SDS 3.2): a Rejected request must keep its reason.
ALTER TABLE "borrow_request" ADD CONSTRAINT "borrow_request_rejection_reason_check"
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);
