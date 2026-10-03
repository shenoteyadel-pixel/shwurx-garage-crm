-- Company running costs (bills, fuel, recovery, materials…) and monthly payroll.

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text,
  vendor text,
  amount numeric(12,2) not null check (amount >= 0),
  vat_amount numeric(12,2) not null default 0 check (vat_amount >= 0),
  expense_date date not null default current_date,
  bill_month date,
  payment_method text not null default 'cash',
  reference text,
  has_invoice boolean not null default false,
  receipt_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint business_expenses_vat_le_amount check (vat_amount <= amount)
);
create index if not exists business_expenses_date_idx on public.business_expenses (expense_date);
create index if not exists business_expenses_category_idx on public.business_expenses (category);

alter table public.business_expenses enable row level security;
drop policy if exists business_expenses_select on public.business_expenses;
create policy business_expenses_select on public.business_expenses for select
  using (public.has_perm('expenses.manage') or public.has_perm('reports.financial'));
drop policy if exists business_expenses_insert on public.business_expenses;
create policy business_expenses_insert on public.business_expenses for insert
  with check (public.has_perm('expenses.manage'));
drop policy if exists business_expenses_update on public.business_expenses;
create policy business_expenses_update on public.business_expenses for update
  using (public.has_perm('expenses.manage')) with check (public.has_perm('expenses.manage'));
drop policy if exists business_expenses_delete on public.business_expenses;
create policy business_expenses_delete on public.business_expenses for delete
  using (public.has_perm('expenses.manage'));

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null,
  base_salary numeric(12,2) not null default 0 check (base_salary >= 0),
  allowances numeric(12,2) not null default 0 check (allowances >= 0),
  overtime numeric(12,2) not null default 0 check (overtime >= 0),
  deductions numeric(12,2) not null default 0 check (deductions >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  payment_method text not null default 'bank_transfer',
  reference text,
  note text,
  paid_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, period_month)
);
create index if not exists salary_payments_paid_on_idx on public.salary_payments (paid_on);

alter table public.salary_payments enable row level security;
drop policy if exists salary_payments_select on public.salary_payments;
create policy salary_payments_select on public.salary_payments for select
  using (user_id = auth.uid() or public.has_perm('payroll.manage') or public.has_perm('reports.financial'));
drop policy if exists salary_payments_write on public.salary_payments;
create policy salary_payments_write on public.salary_payments for all
  using (public.has_perm('payroll.manage')) with check (public.has_perm('payroll.manage'));

-- Payroll staff need to read monthly salaries to prepare the register.
drop policy if exists salaries_select on public.employee_salaries;
create policy salaries_select on public.employee_salaries for select
  using (user_id = auth.uid() or public.has_perm('attendance.manage') or public.has_perm('payroll.manage'));

insert into storage.buckets (id, name, public)
values ('finance-receipts', 'finance-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists finance_receipts_read on storage.objects;
create policy finance_receipts_read on storage.objects for select
  using (bucket_id = 'finance-receipts' and (public.has_perm('expenses.manage') or public.has_perm('reports.financial')));
drop policy if exists finance_receipts_insert on storage.objects;
create policy finance_receipts_insert on storage.objects for insert
  with check (bucket_id = 'finance-receipts' and public.has_perm('expenses.manage'));
drop policy if exists finance_receipts_delete on storage.objects;
create policy finance_receipts_delete on storage.objects for delete
  using (bucket_id = 'finance-receipts' and public.has_perm('expenses.manage'));

insert into public.role_permissions (role, permission, allowed) values
  ('owner','expenses.manage',true), ('general_manager','expenses.manage',true), ('finance','expenses.manage',true),
  ('owner','payroll.manage',true), ('general_manager','payroll.manage',true), ('finance','payroll.manage',true)
on conflict (role, permission) do update set allowed = excluded.allowed;
