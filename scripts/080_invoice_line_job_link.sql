-- Purchaser's choice of which job card line a supplier invoice line fulfils.
-- null = automatic name matching, 'new' = always add a separate line,
-- otherwise the quotation_items id to update instead of adding a duplicate.
alter table public.supplier_invoice_items
  add column if not exists job_line_link text;
