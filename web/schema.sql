-- 케어드라이브 서버 DB (Neon Postgres). 서버에는 하루 요약과 이벤트 여부만 저장한다(원시 위치 없음).
-- 링크(자녀-차량 연결)를 지우면 딸린 기록이 모두 함께 지워진다(on delete cascade).
create table users(id uuid primary key default gen_random_uuid(), phone text unique not null, name text not null default '', relation text not null default '', settings jsonb not null default '{}', created_at timestamptz not null default now());
create table vehicles(id uuid primary key default gen_random_uuid(), vin text unique not null, model text not null, plate text not null default '', code text, code_expires_at timestamptz, subscription text not null default 'active', created_at timestamptz not null default now());
create table sessions(token text primary key, user_id uuid references users on delete cascade, vehicle_id uuid references vehicles on delete cascade, created_at timestamptz not null default now());
create table links(id uuid primary key default gen_random_uuid(), child_id uuid not null references users on delete cascade, vehicle_id uuid not null references vehicles on delete cascade, nickname text not null, status text not null check (status in ('pending','accepted','declined','expired')), paused boolean not null default false, invited_at timestamptz not null default now(), accepted_day date, relearns jsonb not null default '[]', change jsonb);
create table blocks(vehicle_id uuid not null references vehicles on delete cascade, phone text not null, until timestamptz not null, primary key(vehicle_id, phone));
create table days(link_id uuid not null references links on delete cascade, day date not null, trips int not null, night int not null, radius numeric not null, primary key(link_id, day));
create table wanders(id uuid primary key default gen_random_uuid(), link_id uuid not null references links on delete cascade, day date not null, at_label text not null default '', minutes int not null default 0, response text not null check (response in ('accept','none','refuse','destination')), timeline jsonb not null default '[]');
create table alerts(id uuid primary key default gen_random_uuid(), link_id uuid not null references links on delete cascade, kind text not null, day date not null, title text not null, body text not null default '', parent text not null default '', read boolean not null default false, archived boolean not null default false, unique(link_id, kind, day));
create table exclusions(id uuid primary key default gen_random_uuid(), link_id uuid not null references links on delete cascade, kind text not null, start_day date not null, end_day date not null, check (end_day >= start_day));
create table meta(key text primary key, value text not null); -- today: 시연용 날짜
create index on links(child_id);
create index on links(vehicle_id);
