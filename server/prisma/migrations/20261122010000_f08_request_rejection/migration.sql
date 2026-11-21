-- F-08 (SDS 3.2): the reason a custodian gave when rejecting a request. NULL for other statuses.
ALTER TABLE "borrow_request" ADD COLUMN "rejection_reason" VARCHAR(500);
