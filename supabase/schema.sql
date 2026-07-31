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

-- ============================================================
-- 마이그레이션 (2026-07-29): 학생이 실제로 듣는 과목 등록
-- Supabase 대시보드 > SQL Editor 에서 아래 블록만 실행하면 됨.
-- ============================================================

create table student_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  unique (student_id, subject_id)
);

create index on student_subjects (student_id);
create index on student_subjects (subject_id);

-- 기존 배정 기록에서 이미 쓰이고 있던 학생-과목 조합을 역산해 채워 넣는다 (하위 호환).
insert into student_subjects (student_id, subject_id)
select distinct a.student_id, c.subject_id
from assignments a
join schedule_components sc on sc.id = a.schedule_component_id
join schedule_items si on si.id = sc.schedule_item_id
join curricula c on c.id = si.curriculum_id
on conflict (student_id, subject_id) do nothing;

-- ============================================================
-- 마이그레이션 (2026-07-29): 선생님별 로그인 (개인 비밀번호로 구분)
-- Supabase 대시보드 > SQL Editor 에서 아래 블록만 실행하면 됨.
-- password_hash는 scrypt(salt:hash 형태의 hex 문자열)로만 저장하고, 평문은
-- 발급/재발급 시 서버 액션 응답으로 딱 한 번만 노출한다 (DB에는 절대 평문 저장 안 함).
-- 이 테이블은 anon key로 클라이언트에서 직접 select 하지 않는다(Server Action 경유 전용).
-- ============================================================

create table teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 마이그레이션 (2026-07-31): 학생별 담당 선생님 지정
-- Supabase 대시보드 > SQL Editor 에서 아래 블록만 실행하면 됨.
-- ============================================================

alter table students
  add column if not exists teacher_id uuid references teachers(id) on delete set null;

create index if not exists students_teacher_id_idx on students (teacher_id);

-- ============================================================
-- 마이그레이션 (2026-07-31): 복사용 텍스트 지우기
-- 배정 기록(schedule 배정 자체)은 그대로 두고, 배정 화면의 "복사용 텍스트" 박스에서만
-- 이 시각 이전 항목을 숨기기 위한 시각 기록. 표의 "배정됨" 체크/취소 기능에는 영향 없음.
-- Supabase 대시보드 > SQL Editor 에서 아래 블록만 실행하면 됨.
-- ============================================================

alter table students
  add column if not exists copy_cleared_at timestamptz;
