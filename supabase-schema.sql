create table if not exists tesla_tokens (
  user_id text primary key,
  access_token text not null,
  refresh_token text not null,
  token_type text,
  expires_in integer,
  updated_at timestamptz not null default now()
);

create table if not exists daily_kpi (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  platform text default 'Both',
  start_odometer numeric,
  end_odometer numeric,
  total_miles numeric,
  home_charge_kwh numeric,
  supercharge_kwh numeric,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);
