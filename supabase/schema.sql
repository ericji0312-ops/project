-- 학습스케줄 배정 앱 — Supabase 스키마 (스펙 v2 데이터 모델 반영)
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하면 됨.

create extension if not exists "pgcrypto";

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table curricula (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  -- 회차가 구성요소 타입 라벨(개념/연산/RX/쎈/오답노트)을 갖는지 여부.
  -- false면 기출형: "[커리큘럼명]: 내용" 형태로 타입 표시를 생략한다.
  has_typed_components boolean not null default true
);

create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curricula(id) on delete cascade,
  order_no int not null,
  unique (curriculum_id, order_no)
);

create table schedule_components (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null references schedule_items(id) on delete cascade,
  -- 정규화된 타입 (개념/연산/RX/쎈/오답노트/기타 등). UI 필터·컬럼 구분에 사용.
  type text not null,
  -- 원본 파일에 적힌 타입 표기 그대로 (예: "공수1 개념"). 콜론 구분자가 없던 행은 null.
  type_label text,
  -- 콜론(:) 뒤에 오는 본문 텍스트.
  content text not null,
  -- "[커리큘럼명] " 접두어를 뺀 원본 셀 텍스트 전체 (무손실 원본 보존용).
  raw_text text not null
);

create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  schedule_component_id uuid not null references schedule_components(id) on delete cascade,
  deadline_date date not null,
  assigned_at timestamptz not null default now()
);

create index on curricula (subject_id);
create index on schedule_items (curriculum_id);
create index on schedule_components (schedule_item_id);
create index on assignments (student_id);
create index on assignments (schedule_component_id);

-- 이 앱은 Supabase Auth를 쓰지 않고 앱 레벨의 공유 비밀번호로만 접근을 제어한다
-- (스펙 참고). 따라서 RLS를 비활성 상태로 두고 anon key로 직접 읽기/쓰기 한다.
-- 만약 나중에 실제 사용자별 인증을 도입하면 RLS를 켜고 정책을 추가해야 한다.
