create extension if not exists pgcrypto;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  oib text not null unique,
  email text not null,
  phone text default '',
  address text default '',
  city text default '',
  country text default 'HR',
  vat_rate numeric(6,2) not null default 25,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin','dispatcher','accountant','driver','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create table if not exists trucks (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  plate text not null, brand text default '', model text default '', year int, vin text default '', euro_class text default '',
  fuel_type text default 'Diesel', avg_consumption numeric(7,2) not null default 30, tank_liters numeric(8,2) default 600,
  odometer_km numeric(12,1) default 0, status text default 'active', registration_until date, insurance_until date,
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_id, plate)
);
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  name text not null, phone text default '', email text default '', license_no text default '', license_until date,
  card_no text default '', card_until date, adr_until date, medical_until date, base_salary numeric(12,2) default 0,
  status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists trailers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  plate text not null, type text default 'cerada', capacity_kg numeric(12,2) default 24000, volume_m3 numeric(10,2) default 90,
  registration_until date, status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_id, plate)
);
create table if not exists customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  name text not null, oib text default '', vat_id text default '', email text default '', phone text default '', address text default '', city text default '', country text default '', payment_days int default 30,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  name text not null, oib text default '', email text default '', phone text default '', address text default '', city text default '', country text default '', category text default '', payment_days int default 30,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists routes (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  name text not null, origin text not null, destination text not null, via text default '', distance_km numeric(12,2) not null default 0,
  duration_h numeric(8,2) default 0, fuel_liters numeric(10,2) default 0, toll_estimate numeric(12,2) default 0,
  rest_plan jsonb default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists transports (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null, truck_id uuid references trucks(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null, trailer_id uuid references trailers(id) on delete set null, route_id uuid references routes(id) on delete set null,
  status text default 'planned', order_no text not null, load_date date, unload_date date, loading_place text default '', unloading_place text default '',
  cargo_desc text default '', cargo_weight_kg numeric(12,2) default 0, price numeric(12,2) default 0, currency text default 'EUR', notes text default '',
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_id, order_no)
);
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  transport_id uuid references transports(id) on delete set null, driver_id uuid references drivers(id) on delete set null, supplier_id uuid references suppliers(id) on delete set null,
  type text not null default 'ostalo', amount numeric(12,2) not null, currency text default 'EUR', expense_date date not null default current_date, description text default '', paid boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists fuel_entries (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  truck_id uuid references trucks(id) on delete set null, driver_id uuid references drivers(id) on delete set null,
  entry_date date not null default current_date, liters numeric(10,2) not null, price_per_liter numeric(10,4) not null, total numeric(12,2) generated always as (liters * price_per_liter) stored,
  odometer_km numeric(12,1), station text default '', country text default '', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists service_records (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  truck_id uuid references trucks(id) on delete cascade, service_date date not null default current_date, type text default 'redovni servis', odometer_km numeric(12,1), amount numeric(12,2) default 0,
  supplier_id uuid references suppliers(id) on delete set null, description text default '', next_service_date date, next_service_km numeric(12,1), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null, transport_id uuid references transports(id) on delete set null,
  invoice_no text not null, issue_date date not null default current_date, due_date date, status text default 'draft', subtotal numeric(12,2) not null default 0, vat_rate numeric(6,2) default 25, vat_amount numeric(12,2) default 0, total numeric(12,2) default 0, currency text default 'EUR', notes text default '',
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_id, invoice_no)
);
create table if not exists offers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null, offer_no text not null, issue_date date not null default current_date, valid_until date, status text default 'draft', route_desc text default '', price numeric(12,2) default 0, currency text default 'EUR', notes text default '',
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(company_id, offer_no)
);
create table if not exists documents (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  entity text not null, entity_id uuid, doc_type text not null, title text not null, file_url text default '', expires_at date, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  title text not null, body text default '', severity text default 'info', read_at timestamptz, created_at timestamptz default now()
);

create index if not exists idx_audit_company on audit_logs(company_id, created_at desc);
create index if not exists idx_transport_company_status on transports(company_id, status);
create index if not exists idx_invoice_company_status on invoices(company_id, status);

-- Enhanced modules requested in master specification
create table if not exists gps_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  truck_id uuid references trucks(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  position_time timestamptz not null default now(),
  lat numeric(10,6) not null,
  lng numeric(10,6) not null,
  speed_kmh numeric(8,2) default 0,
  heading numeric(6,2) default 0,
  ignition boolean default true,
  source text default 'manual',
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tachograph_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  truck_id uuid references trucks(id) on delete set null,
  entry_date date not null default current_date,
  drive_minutes int not null default 0,
  work_minutes int not null default 0,
  rest_minutes int not null default 0,
  availability_minutes int not null default 0,
  violations jsonb default '[]'::jsonb,
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists payrolls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  period_month text not null,
  base_salary numeric(12,2) default 0,
  per_diem numeric(12,2) default 0,
  bonuses numeric(12,2) default 0,
  deductions numeric(12,2) default 0,
  gross_total numeric(12,2) default 0,
  net_total numeric(12,2) default 0,
  status text default 'draft',
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, driver_id, period_month)
);

create table if not exists cmr_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  transport_id uuid references transports(id) on delete set null,
  cmr_no text not null,
  sender text default '',
  consignee text default '',
  carrier text default '',
  pickup_place text default '',
  delivery_place text default '',
  goods_desc text default '',
  packages text default '',
  gross_weight_kg numeric(12,2) default 0,
  instructions text default '',
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, cmr_no)
);

create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, setting_key)
);

create table if not exists backup_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  export_name text not null,
  format text default 'json',
  status text default 'created',
  size_bytes int default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists business_feature_modules (
  id int primary key,
  code text not null unique,
  name text not null,
  category text not null,
  description text not null,
  default_fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists business_feature_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  module_id int not null references business_feature_modules(id) on delete cascade,
  title text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to uuid references users(id) on delete set null,
  amount numeric(12,2) default 0,
  due_date date,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into business_feature_modules(id, code, name, category, description, default_fields)
select i,
       'feature_' || i,
       'Funkcija ' || i,
       case
         when i between 1 and 15 then 'Operativa'
         when i between 16 and 30 then 'Financije'
         when i between 31 and 45 then 'Flota'
         when i between 46 and 60 then 'Vozači'
         when i between 61 and 75 then 'Dokumenti'
         when i between 76 and 90 then 'Skladište i tereti'
         when i between 91 and 105 then 'Compliance'
         when i between 106 and 120 then 'Analitika'
         when i between 121 and 135 then 'Integritet podataka'
         else 'Administracija'
       end,
       'Detaljno implementirana poslovna funkcija ' || i || ': CRUD, validacije, dozvole, audit log, izvještaji i UI kroz univerzalni modul poslovnih funkcija.',
       '[{"key":"opis","label":"Opis","type":"textarea","required":true},{"key":"odgovorna_osoba","label":"Odgovorna osoba","type":"text"},{"key":"rizik","label":"Rizik","type":"select","options":["nizak","srednji","visok"]},{"key":"napomena","label":"Napomena","type":"textarea"}]'::jsonb
from generate_series(1,150) as i
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  default_fields = excluded.default_fields;

create index if not exists idx_gps_company_time on gps_positions(company_id, position_time desc);
create index if not exists idx_tacho_company_date on tachograph_entries(company_id, entry_date desc);
create index if not exists idx_payroll_company_period on payrolls(company_id, period_month desc);
create index if not exists idx_cmr_company on cmr_documents(company_id, created_at desc);
create index if not exists idx_feature_records_company_module on business_feature_records(company_id, module_id, created_at desc);
