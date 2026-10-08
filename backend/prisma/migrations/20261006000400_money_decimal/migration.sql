-- Monetary fields move from Float (double precision) to Decimal(14,2): FCFA amounts stay exact
-- (0.01 FCFA granularity, up to 999 999 999 999,99 FCFA) with no rounding drift. Non-monetary
-- numbers (grades, GPS, averages) keep their Float type.
--
-- PostgreSQL casts double precision → numeric safely; existing values are rounded to 2 decimals.

-- StaffMember.baseSalary
ALTER TABLE "StaffMember" ALTER COLUMN "baseSalary" TYPE DECIMAL(14,2) USING "baseSalary"::numeric(14,2);

-- Invoice.totalAmount
ALTER TABLE "Invoice" ALTER COLUMN "totalAmount" TYPE DECIMAL(14,2) USING "totalAmount"::numeric(14,2);

-- InvoiceItem.amount
ALTER TABLE "InvoiceItem" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING "amount"::numeric(14,2);

-- Payment.amount
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING "amount"::numeric(14,2);

-- TransportRoute.monthlyFee
ALTER TABLE "TransportRoute" ALTER COLUMN "monthlyFee" TYPE DECIMAL(14,2) USING "monthlyFee"::numeric(14,2);

-- Payslip.baseSalary / bonuses / deductions / netSalary
ALTER TABLE "Payslip" ALTER COLUMN "baseSalary" TYPE DECIMAL(14,2) USING "baseSalary"::numeric(14,2);
ALTER TABLE "Payslip" ALTER COLUMN "bonuses" TYPE DECIMAL(14,2) USING "bonuses"::numeric(14,2);
ALTER TABLE "Payslip" ALTER COLUMN "deductions" TYPE DECIMAL(14,2) USING "deductions"::numeric(14,2);
ALTER TABLE "Payslip" ALTER COLUMN "netSalary" TYPE DECIMAL(14,2) USING "netSalary"::numeric(14,2);
