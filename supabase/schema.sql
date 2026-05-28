-- Create a Supabase schema for the Transaction Suivi MVP

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  role text not null,
  email text,
  phone text,
  created_at timestamp with time zone default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  property text not null,
  buyer text not null,
  buyer_id uuid,
  seller text not null,
  seller_id uuid,
  notaire text,
  notaire_id uuid,
  compromis_date date not null,
  price numeric not null,
  loan_status text not null,
  document_status text not null,
  notaire_status text not null,
  completed boolean not null default false,
  created_at timestamp with time zone default now()
);

alter table contacts enable row level security;
alter table contacts force row level security;

create policy "Allow owners to select their contacts" on contacts
  for select using (user_id = auth.uid());
create policy "Allow owners to insert their contacts" on contacts
  for insert with check (user_id = auth.uid());
create policy "Allow owners to update their contacts" on contacts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Allow owners to delete their contacts" on contacts
  for delete using (user_id = auth.uid());

alter table transactions enable row level security;
alter table transactions force row level security;

create policy "Allow owners to select their transactions" on transactions
  for select using (user_id = auth.uid());
create policy "Allow owners to insert their transactions" on transactions
  for insert with check (user_id = auth.uid());
create policy "Allow owners to update their transactions" on transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Allow owners to delete their transactions" on transactions
  for delete using (user_id = auth.uid());
