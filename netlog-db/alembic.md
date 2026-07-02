# NETLOG DB 마이그레이션 가이드

## 목차
1. [디렉토리 구조](#디렉토리-구조)
2. [초기 세팅 (처음 합류한 팀원)](#초기-세팅-처음-합류한-팀원)
3. [버전 이력](#버전-이력)
4. [마이그레이션 명령어](#마이그레이션-명령어)
5. [새 마이그레이션 작성 방법](#새-마이그레이션-작성-방법)
6. [주의사항](#주의사항)

---

## 디렉토리 구조

```
netlog_db_v1/
├── sql/
│   └── schema.sql                  ← 현재 DB 전체 구조 (최신 상태 항상 유지)
├── migrations/
│   ├── env.py                      ← Alembic 환경 설정
│   ├── script.py.mako
│   └── versions/                   ← 마이그레이션 파일들
│       ├── xxxx_baseline_v2.py
│       └── xxxx_update_v_site_dashboard.py
├── alembic.ini                     ← Alembic 설정 파일
├── .env                            ← DB 접속 정보 (Git 제외)
├── .env.example                    ← .env 양식 (Git 포함)
└── .gitignore
```

> `schema.sql` → 현재 DB의 전체 상태를 담은 참조용 파일. 직접 DB에 실행하지 않음.
> 실제 DB 반영은 **항상 Alembic을 통해서만** 진행.

---

## 초기 세팅 (처음 합류한 팀원)

### 1. 저장소 클론


### 2. 가상환경 세팅

```bash
python -m venv myenv

# Windows
myenv\scripts\activate

# Mac / Linux
source myenv/bin/activate
```

### 3. 패키지 설치

```bash
pip install -r "requirements.txt"
```

### 4. .env 파일 생성

`.env.example`을 복사해서 `.env`를 만들고 접속 정보를 입력.
접속 정보는 팀 노션 또는 팀장에게 문의.

```bash
cp .env.example .env
```

`.env` 내용:

```env
DATABASE_URL=postgresql://유저명:비밀번호@호스트:포트/railway
```

### 5. 현재 DB 상태 확인

```bash
alembic current
```

아래처럼 revision 해시값이 뜨면 정상.

```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
xxxx (head)
```

### 6. 최신 마이그레이션 적용

```bash
alembic upgrade head
```

---

## 버전 이력

| 버전 | 파일명 | 변경 내용 | 적용 방법 |
| --- | --- | --- | --- |
| v1 | `schema.sql` | `collection_record`에 `status` 추가 / `processing_bundle`에 `status` 추가 | DBeaver로 직접 실행 (Alembic 도입 전) |
| v2 | `xxxx_update_v_site_dashboard.py` | `v_site_dashboard` 뷰에 `waiting_days`, `bag_status` 추가 | `alembic upgrade head` |

> v1: DBeaver로 직접 적용한 이력을 베이스라인으로 지정
> v2부터 Alembic으로 관리.

---

## 마이그레이션 명령어

### 현재 적용된 버전 확인

```bash
alembic current
```

### 전체 이력 확인

```bash
alembic history --verbose
```

### 최신 버전으로 업그레이드

```bash
alembic upgrade head
```

### 한 단계씩 업그레이드

```bash
alembic upgrade +1
```

### 한 단계 롤백

```bash
alembic downgrade -1
```

### 특정 버전으로 이동

```bash
alembic upgrade xxxx   # xxxx = revision 해시값
alembic downgrade xxxx
```

---

## 새 마이그레이션 작성 방법

DB 구조를 변경할 때는 아래 순서를 반드시 따라주세요.

### 1. 마이그레이션 파일 생성

```bash
alembic revision -m "변경_내용_요약"
```

예시:

```bash
alembic revision -m "add_region_to_site"
```

`migrations/versions/` 폴더에 파일이 생성됨.

### 2. 생성된 파일에 내용 작성

```python
# migrations/versions/xxxx_add_region_to_site.py

revision = 'xxxx'
down_revision = 'yyyy'   # 이전 버전 revision 값 (자동 입력됨)
branch_labels = None
depends_on = None

def upgrade():
    # 변경 사항 작성
    op.add_column('site', sa.Column('region_code', sa.Text(), nullable=True))

def downgrade():
    # 롤백 시 되돌리는 코드 작성
    op.drop_column('site', 'region_code')
```

> `downgrade()`는 반드시 작성. 롤백 가능해야 안전하게 운영 가능.

### 3. DB에 적용

```bash
alembic upgrade head
```

### 4. schema.sql 업데이트

`sql/schema.sql`을 열어서 변경 사항을 직접 반영.

### 5. Git 커밋

마이그레이션 파일과 schema.sql을 **항상 같이** 커밋.

```bash
git add migrations/versions/xxxx_add_region_to_site.py
git add sql/schema.sql
git commit -m "feat: site 테이블에 region_code 컬럼 추가"
```

---

## 주의사항

### ❌ 하지 말아야 할 것

```
- schema.sql을 직접 DB에 실행하지 않는다
- DBeaver 등으로 DB를 직접 수정하지 않는다
- 이미 적용된 마이그레이션 파일의 내용을 수정하지 않는다
- .env 파일을 Git에 올리지 않는다
```

### ✅ 반드시 지켜야 할 것

```
- DB 변경은 항상 Alembic 마이그레이션 파일로 작성
- 마이그레이션 적용 후 schema.sql 업데이트
- 마이그레이션 파일과 schema.sql은 항상 같이 커밋
- downgrade() 는 반드시 작성
```

### 긴급하게 DBeaver로 직접 수정한 경우

Alembic이 모르는 상태가 되므로 아래 절차로 이력을 맞춰줘야 함.

```bash
# 1. 해당 변경 내용으로 마이그레이션 파일 생성
alembic revision -m "변경_내용"

# 2. upgrade()에 동일한 내용 작성, downgrade()도 작성

# 3. DB는 이미 적용됐으므로 이력만 등록
alembic stamp head

# 4. schema.sql 업데이트 후 커밋
```