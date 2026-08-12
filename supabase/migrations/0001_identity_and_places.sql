-- Xanthus: identity, relationships, and the first two features that need
-- them (place ratings, coach visibility into a student's runs).
--
-- Everything the app did before this migration is 100% local (IndexedDB,
-- no account). This adds an *optional* backend layer on top — recording a
-- run, personal history, and PRs stay fully local and account-free. An
-- account only exists to attribute a place rating, add a friend, or let a
-- coach see a student's training.
--
-- Auth itself is Supabase's own client-side auth (no Auth.js): the app is
-- a static export (`output: "export"`, Cloudflare Pages, no Next.js server
-- runtime), so there is nowhere to run the server-side OAuth callback
-- Auth.js needs. Supabase's JS SDK does the whole OAuth round trip from
-- the browser and is designed for exactly this shape of app.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ profiles
-- Mirrors `auth.users`, one row per account, with the public-facing bits.
-- auth.users itself holds the real identity (email, OAuth provider); this
-- table is what's actually queryable/joinable from RLS policies and from
-- the app, and it's what makes a person *discoverable* — email is private,
-- a handle is how someone finds you to add as a friend or student.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "a person can only edit their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up, seeding the
-- handle from their email so there's never a signed-in user with no
-- profile row — every foreign key below assumes one exists.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '_', 'g'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- visibility
-- Shared by every kind of content a user can choose to show or hide.
-- "friends" here means an *accepted* row in `friendships` — see
-- `is_friend_of` below, used by every RLS policy that checks it.
create type public.visibility as enum ('public', 'friends', 'private');

-- --------------------------------------------------------------- friendships
-- Symmetric and mutual, request/accept — same shape as a follow-back
-- system, not a one-way follow. The `pair_key` generated column collapses
-- (A, B) and (B, A) onto the same identity so a duplicate or reversed
-- request can't create a second pending row.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  pair_key text generated always as (
    least(requester_id::text, addressee_id::text) || ':' || greatest(requester_id::text, addressee_id::text)
  ) stored,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friendship check (requester_id <> addressee_id),
  unique (pair_key)
);

alter table public.friendships enable row level security;

create policy "see friendships you're part of"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "send a friend request"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "only the addressee accepts, either side can cancel/unfriend"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (
    -- Accepting is addressee-only; everything else (still pending, or
    -- unfriending by deleting-via-update-to-a-terminal-state) either side
    -- can do to their own participation in the row.
    (status = 'accepted' and auth.uid() = addressee_id) or status = 'pending'
  );

create policy "either side can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create function public.is_friend_of(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- ---------------------------------------------------------- coach relationships
-- Deliberately a separate table from `friendships`, not a flag on it:
-- coach/student is asymmetric (one side sees the other's training data,
-- not both) and grants a different kind of access (into `runs`, see
-- below) than being friends does. A coach doesn't have to be a friend.
create table public.coach_relationships (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- Either side can propose the relationship (a coach adding a student, or
  -- a student asking to be coached); `proposed_by` records which, so the
  -- UI knows who's waiting on whom without a second status value.
  proposed_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_coaching check (coach_id <> student_id),
  unique (coach_id, student_id)
);

alter table public.coach_relationships enable row level security;

create policy "see coach relationships you're part of"
  on public.coach_relationships for select
  using (auth.uid() = coach_id or auth.uid() = student_id);

create policy "propose a coach relationship from either side"
  on public.coach_relationships for insert
  with check (auth.uid() = proposed_by and (auth.uid() = coach_id or auth.uid() = student_id));

create policy "only the non-proposing side accepts"
  on public.coach_relationships for update
  using (auth.uid() = coach_id or auth.uid() = student_id)
  with check (
    (status = 'accepted' and auth.uid() <> proposed_by) or status = 'pending'
  );

create policy "either side can end a coach relationship"
  on public.coach_relationships for delete
  using (auth.uid() = coach_id or auth.uid() = student_id);

create function public.is_coach_of(coach uuid, student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.coach_relationships
    where coach_relationships.coach_id = coach
      and coach_relationships.student_id = student
      and status = 'accepted'
  );
$$;

-- ------------------------------------------------------------ place ratings
-- The community half of "lugares pra correr" — the seed list itself
-- (name, description, curated notes) stays a static array shipped with
-- the app, same pattern as the evidence facts; only per-person ratings
-- live here. `place_id` matches that static array's id (e.g.
-- "parque-ibirapuera"), not a foreign key — the seed list isn't a table.
create table public.place_ratings (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seguranca smallint not null check (seguranca between 1 and 5),
  percurso smallint not null check (percurso between 1 and 5),
  estrutura smallint not null check (estrutura between 1 and 5),
  iluminacao smallint not null check (iluminacao between 1 and 5),
  fluxo smallint not null check (fluxo between 1 and 5),
  note text,
  -- Defaults public: an anonymous safety tip about a park is exactly the
  -- kind of thing that's only useful if strangers can see it, unlike a run.
  visibility public.visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

alter table public.place_ratings enable row level security;

create policy "see ratings by visibility"
  on public.place_ratings for select
  using (
    visibility = 'public'
    or auth.uid() = user_id
    or (visibility = 'friends' and public.is_friend_of(auth.uid(), user_id))
  );

create policy "rate a place as yourself"
  on public.place_ratings for insert
  with check (auth.uid() = user_id);

create policy "edit or remove only your own rating"
  on public.place_ratings for update
  using (auth.uid() = user_id);

create policy "delete only your own rating"
  on public.place_ratings for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------------ runs
-- Cloud sync is opt-in and per-account, not automatic: a run only lands
-- here if the signed-in user's device pushes it (still written to
-- IndexedDB first, same as always — this is a copy, not the source of
-- truth). Defaults to private, unlike ratings, because a run is personal
-- by default; a coach relationship grants access independent of that
-- default so a student never has to flip visibility to 'public' or
-- 'friends' just so their coach can see training.
--
-- `points` is the full GPS trace as JSONB, same shape as the local
-- `StoredPoint[]` — optional per row (a coach relationship might only need
-- summary stats, not the raw route) and worth revisiting for size once
-- real sync volume exists; this is the shape, not a final storage
-- decision.
create table public.runs (
  id text primary key, -- reuses the local CompletedRun.id so a device's copy and the cloud copy are the same row, not a duplicate
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  distance_meters double precision not null,
  moving_seconds integer not null,
  points jsonb,
  shoe_name text,
  visibility public.visibility not null default 'private',
  synced_at timestamptz not null default now()
);

alter table public.runs enable row level security;

create policy "see runs by visibility, or as the athlete's coach"
  on public.runs for select
  using (
    auth.uid() = user_id
    or visibility = 'public'
    or (visibility = 'friends' and public.is_friend_of(auth.uid(), user_id))
    or public.is_coach_of(auth.uid(), user_id)
  );

create policy "sync only your own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "update or delete only your own synced runs"
  on public.runs for update
  using (auth.uid() = user_id);

create policy "delete only your own synced runs"
  on public.runs for delete
  using (auth.uid() = user_id);
