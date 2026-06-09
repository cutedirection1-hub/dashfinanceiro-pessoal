-- 20240608_add_paid_by_responsible_to_credit_card_transactions.sql

ALTER TABLE credit_card_transactions
ADD COLUMN paid_by_responsible boolean NOT NULL DEFAULT false;
