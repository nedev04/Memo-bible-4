-- Схема для облачной синхронизации «Наизусть».
-- Выполните целиком в Supabase: SQL Editor -> New query -> Run.
-- Скрипт можно запускать повторно.

create table if not exists public.texts (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  title              text   not null,
  content            text   not null,
  created_at         bigint not null,
  level              int    not null,
  level_points       int    not null,
  level_changed_at   bigint not null,
  last_level_up_at   bigint,
  next_review_at     bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create table if not exists public.attempts (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  text_uid           uuid   not null,
  exercise           text   not null,
  difficulty         int    not null,
  score              int    not null,
  points             int    not null,
  created_at         bigint not null,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create index if not exists texts_sync_idx    on public.texts    (user_id, server_updated_at);
create index if not exists attempts_sync_idx on public.attempts (user_id, server_updated_at);
create index if not exists attempts_text_idx on public.attempts (user_id, text_uid);

-- Время изменения по часам сервера (по нему клиенты забирают новые записи).
-- Для текстов дополнительно: более старая версия не затирает более новую.
create or replace function public.texts_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create or replace function public.touch_server_time() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists texts_before_write on public.texts;
create trigger texts_before_write before insert or update on public.texts
  for each row execute function public.texts_before_write();

drop trigger if exists attempts_touch on public.attempts;
create trigger attempts_touch before insert or update on public.attempts
  for each row execute function public.touch_server_time();

-- Безопасность: каждый пользователь видит и меняет только свои строки.
alter table public.texts    enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "texts: own rows"    on public.texts;
drop policy if exists "attempts: own rows" on public.attempts;

create policy "texts: own rows" on public.texts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "attempts: own rows" on public.attempts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =====================================================================
-- Версия 2: стихи Библии и журнал результатов.
-- Если вы уже запускали файл раньше, выполните его целиком ещё раз: он дополняет схему.
-- =====================================================================

create table if not exists public.verses (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  key                text   not null,
  translation        text   not null,
  book               text   not null,
  chapter            int    not null,
  verse              int    not null,
  added_at           bigint not null,
  strength           int    not null,
  next_review_at     bigint not null,
  last_up_at         bigint,
  last_practiced_at  bigint,
  last_score         int,
  lapses             int    not null default 0,
  updated_at         bigint not null,
  deleted_at         bigint,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);

create table if not exists public.reviews (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  verse_key          text   not null,
  exercise           text   not null,
  tier               int    not null,
  score              int    not null,
  xp                 int    not null,
  created_at         bigint not null,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create index if not exists verses_sync_idx  on public.verses  (user_id, server_updated_at);
create index if not exists reviews_sync_idx on public.reviews (user_id, server_updated_at);

-- Для стихов тот же принцип, что и для текстов: более старая запись не затирает более новую.
drop trigger if exists verses_before_write on public.verses;
create trigger verses_before_write before insert or update on public.verses
  for each row execute function public.texts_before_write();

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before insert or update on public.reviews
  for each row execute function public.touch_server_time();

alter table public.verses  enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "verses: own rows"  on public.verses;
drop policy if exists "reviews: own rows" on public.reviews;

create policy "verses: own rows" on public.verses
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reviews: own rows" on public.reviews
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =====================================================================
-- Версия 3: история уроков (путь на главной).
-- Выполните файл целиком ещё раз: он дополняет схему, существующие данные не затрагивает.
-- =====================================================================

create table if not exists public.lessons (
  user_id            uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  uid                uuid   not null,
  type               text   not null,
  status             text   not null,
  verse_keys         jsonb  not null default '[]'::jsonb,
  xp                 int    not null default 0,
  mistakes           int    not null default 0,
  created_at         bigint not null,
  server_updated_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, uid)
);

create index if not exists lessons_sync_idx on public.lessons (user_id, server_updated_at);

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before insert or update on public.lessons
  for each row execute function public.touch_server_time();

alter table public.lessons enable row level security;

drop policy if exists "lessons: own rows" on public.lessons;
create policy "lessons: own rows" on public.lessons
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =====================================================================
-- Версия 4: стадия повторения у стихов (расписание отделено от силы).
-- Выполните файл целиком ещё раз. Строки, созданные раньше, получат стадию 0;
-- приложение само пересчитает её по силе при чтении.
-- =====================================================================

alter table public.verses add column if not exists stage int not null default 0;


-- =====================================================================
-- Заметка: режим «свои тексты» убран из приложения, таблицы texts и attempts больше не используются.
-- Если они вам не нужны, можно удалить их вручную (данные в них будут потеряны безвозвратно):
--   drop table if exists public.attempts;
--   drop table if exists public.texts;
-- Столбцы type и status в таблице lessons остались от прежней версии: приложение заполняет их одинаково.
-- =====================================================================

-- =====================================================================
-- Версия 5: общий кэш вариантов ответов от ИИ для упражнения «Пропущенные слова».
-- Выполните файл целиком ещё раз. Таблицу заполняет функция gap-options (см. README), пользователи могут её только читать.
-- =====================================================================

create table if not exists public.verse_options (
  key         text        not null,                 -- ключ стиха, например rst:mat:5:7
  text_hash   text        not null,                 -- хэш текста стиха: при изменении текста варианты считаются заново
  items       jsonb       not null,                 -- [{ "i": номер слова, "word": "...", "options": ["...", ...] }]
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (key, text_hash)
);

create index if not exists verse_options_user_idx on public.verse_options (created_by, created_at);

alter table public.verse_options enable row level security;

drop policy if exists "verse_options: read" on public.verse_options;
create policy "verse_options: read" on public.verse_options
  for select to authenticated using (true);
