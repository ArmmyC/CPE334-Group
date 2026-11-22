-- F-16 (SDS 3.2): when a loan was renewed. NULL means not renewed. Existing rows keep NULL.
ALTER TABLE "loan" ADD COLUMN "renewed_at" TIMESTAMPTZ(3);
