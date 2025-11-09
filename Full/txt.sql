-- Supabase schema for Youssef AI persistence
-- Run these statements in the SQL editor for project https://eovdsfouwvgtvlhxmqya.supabase.co

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  email text not null unique,
  name text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login timestamptz not null default now(),
  login_count integer not null default 1
);

create index if not exists idx_users_google_id on public.users (google_id);
create index if not exists idx_users_email on public.users (email);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  sandbox_id text,
  last_prompt text,
  last_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz default now()
);

create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_projects_updated_at on public.projects (updated_at desc);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_messages_project on public.project_messages (project_id, created_at);

-- Optional: enable Row-Level Security and policies if you plan to use the anon key from the browser.
-- For server-side usage with the service role key, RLS can remain disabled.
