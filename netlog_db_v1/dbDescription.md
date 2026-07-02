# 📦 NETLOG DB 스키마 상세 가이드 v1

> **Phase 1 완성 및 Phase 2 기초 설계 기술 문서**
> 이 문서는 PostgreSQL DDL (`netlog_ddl_v1.sql`) 스키마에 정의된 모든 데이터베이스 객체의 논리적 구조, 비즈니스 제약조건, 데이터 흐름 및 내부 연산 규칙을 개발자가 이해할 수 있도록 상세히 설명합니다.

---

> [!IMPORTANT]
> 📊 **ERD 시각화 안내**
> 데이터베이스의 시각적 구조와 테이블 간 관계(외래키 맵핑 등)를 한눈에 파악하려면 아래의 온라인 ERD 도구 링크로 접속하여 확인하시기 바랍니다.
> * **[ERD 뷰어 링크](https://www.erdcloud.com/d/JvoPvg9PzswGYwh8n)**

---

## 🆕 최신 업데이트 내역 (2026.06.04)
* **검수 원본 마킹**: `inspection_record`에 수거 완료 확인용 안전장치(`is_collected` 플래그) 추가
* **개별 계근 도입**: `collection_site_detail`에 거점별 실제 측정 무게(`weight_kg`) 필드 신설
* **자동 무게 합산**: 거점 무게 입력 시 `collection_record.total_weight_kg`가 자동 산출되도록 신규 트리거 적용

---

## 🔄 v0 → v1 주요 변경 요약

| 구분 | 변경 사항 | 상세 비즈니스 목적 |
|:---|:---|:---|
| **테이블 통합** | `site`와 `inspector`를 단일 테이블 `site`로 통합 | 검수원의 복잡한 인증 절차를 간소화하고, 집하장 코드(`site_code`)와 6자리 PIN 번호 해시(`pin_hash`)를 이용한 direct 로그인을 통해 관리 비용 최소화. |
| **컬럼 제약 완화** | `collection_record.total_weight_kg`을 **NULL 허용**으로 변경 | 수거 출발 시점에 record를 먼저 생성하고, 실제 계근장에서 무게 측정을 완료한 후 해당 필드를 사후에 `UPDATE`하는 실제 운영 흐름을 유연하게 수용. |
| **올바로 필드 확장** | `collection_record`에 정부 올바로 시스템 연동용 필드 **8종 추가** | 차량번호, 배출자명, 인계자/인수자 정보, 폐기물 코드 및 처리방법 코드/명을 수집하여 국가 표준 전자인계서 시스템(올바로) 수기 등록 생산성을 극대화. |
| **선박 무결성 강화** | `vessel` 테이블의 선박 이름(`name`)에 `UNIQUE` 제약조건 추가 | 동일 명칭의 선박이 중복 등록되어 이력 추적이 왜곡되는 것을 방지. |
| **공정 고도화** | `lot` 테이블에 실제 적용된 공정 방법 코드 및 명 추가 | 수거 단계뿐만 아니라 가공/펠릿 생산 시점(`lot`)에도 세부 가공 처리 방법을 추적할 수 있도록 개선. |
| **트리거 확장** | `trg_dequeue_bags_fifo`를 **INSERT 및 UPDATE 모두** 감지하도록 개정 | 수거 등록과 동시에 즉각 수거 완료 처리(`completed_at IS NOT NULL`)를 실행하는 모바일 앱의 One-step 시나리오에서도 FIFO 차감이 누락 없이 작동하도록 보장. |
| **신규 통계 뷰** | 대시보드용 통합 뷰 2종 신규 구현 | 실시간 재고와 최근 수거일 등을 연동하는 `v_site_dashboard`, 올바로 데이터 조회를 돕는 `v_olbaro_export` 추가. |
| **Phase 2 준비** | `monthly_archive` 테이블 및 관련 기초 통계 뷰 3종 신규 설계 | 월말 정산 배치 작업 및 아카이브 데이터(합성 콜라주 이미지, 누적 무게 및 집하장 활성율) 보존용 토대 구축. |

---

## 🗺️ 테이블 관계 전체 구조

```
[netspa_manager] (관리자 계정: admin/operator)
      │
      │ ┌── [collection_plan] (수거 동선 계획)
      │ │        │
      ├─┼──▶ [collection_plan_site] (계획 대상 거점 - N:M) ◀── [site] (거점 마스터 및 PIN 로그인)
      │ │                                                          │
      │ │                                                          ▼
      │ └──▶ [collection_record] (수거 실행 기록)           [inspection_record] (선박별 어망 검수)
      │              │                                             │
      │              ├──▶ [collection_site_detail]                 │ (INSERT 시 enqueue)
      │              │        │ (FIFO 차감 트리거 작동)              ▼
      │              │        └──────────────────────────────▶ [site_bag_queue] (FIFO 재고 큐)
      │              │
      │              └─▶ [batch_collection] (배치-수거 매핑)
      │                        │
      └──────────────▶ [processing_batch] (공정 투입 배치)
                               │
                             [lot] (공정별 롯트 분할)
                               │
                             [lot_composition] (롯트 내 거점별 원료 추정 조성비)
                               │
                               └─▶ [site] (원천 거점 추적)

[monthly_archive] ─── (Phase 2 월간 데이터/이미지 아카이브 결과물 보존용 단독 테이블)
```

---

## 🆕 ENUM 타입 정의

데이터의 정합성을 도메인 수준에서 강제하기 위해 PostgreSQL ENUM 타입을 적극적으로 활용합니다.

### 1. `manager_role` — 관리자 역할
* **정의**: `CREATE TYPE manager_role AS ENUM ('admin', 'operator');`
* **값 목록**:
  * `admin`: 넷스파 본사 관리자. 수거 계획(`collection_plan`) 수립 권한 보유.
  * `operator`: 현장 수거 기사(차량 운반자). 실제 수거 실행 및 계근 기록(`collection_record`) 관리 권한 보유.

### 2. `plan_status` — 수거 계획 상태
* **정의**: `CREATE TYPE plan_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');`
* **값 목록**:
  * `pending`: 계획 수립 완료, 현장 출발 대기 상태.
  * `in_progress`: 차량이 출항하여 거점들을 순회하며 수거 활동 중인 상태.
  * `completed`: 모든 계획된 거점의 수거가 완료되고 계근까지 마친 상태.
  * `cancelled`: 수거 계획이 취소된 상태.

### 3. `batch_status` — 공정 배치 상태
* **정의**: `CREATE TYPE batch_status AS ENUM ('assembling', 'processing', 'processed');`
* **값 목록**:
  * `assembling`: 여러 수거 기록들을 공정 단위(예: 10톤)로 묶어 조립하고 있는 초기 상태.
  * `processing`: 분쇄 및 가공 라인에 원료가 물리적으로 투입되어 처리 중인 상태.
  * `processed`: 공정 가공이 완료되어 펠릿 제품 생산이 종결된 상태.

### 4. `lot_status` — 롯트 상태
* **정의**: `CREATE TYPE lot_status AS ENUM ('pending', 'processing', 'processed');`
* **값 목록**:
  * `pending`: 배치 분할 후 가공 대기 상태.
  * `processing`: 가공 진행 중.
  * `processed`: 롯트 단위 가공 완료.

---

## 📋 테이블 상세 명세 (1 ~ 14)

### 1. `site` — 거점 (집하장) 마스터 ✏️ v1 통합 및 간소화
어망을 집하하는 항구/거점 정보 및 해당 거점 전용 태블릿 로그인을 위한 계정 정보를 하나의 테이블로 통합 관리합니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **site_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 거점의 시스템 고유 식별자 |
| **site_code** | TEXT | ✅ | `UNIQUE` | **[로그인 ID]** 집하장별로 고유하게 부여된 인계 코드 (예: 'SITE-01') |
| **name** | TEXT | ✅ | - | 거점 명칭 (예: '수우도 선착장') |
| **region** | TEXT | ✅ | - | 소속 광역/기초 자치구역 (예: '통영시') |
| **address** | TEXT | ❌ | - | 세부 지번 주소 또는 위치 설명 |
| **latitude** | NUMERIC(9,6) | ✅ | - | 지도 연동을 위한 위도 좌표 정보 |
| **longitude** | NUMERIC(9,6) | ✅ | - | 지도 연동을 위한 경도 좌표 정보 |
| **pin_hash** | TEXT | ✅ | - | **[로그인 PW]** 6자리 PIN 번호를 암호화한 해시값. 검수원은 별도의 개인 계정 없이 거점 코드와 PIN 번호로 direct 로그인합니다. |
| **created_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 거점 최초 등록 일시 |

---

### 2. `vessel` — 선박 마스터 ✏️ v1 무결성 추가
어망을 바다에서 수거하여 집하장으로 반입하는 원천 선박들을 구별하는 식별 마스터입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **vessel_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 선박 고유 식별자 |
| **name** | TEXT | ✅ | `UNIQUE` | 선박명 (예: '창성호'). 중복 선박 등록 방지를 위한 유니크 제한. |
| **created_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 선박 마스터 최초 등록 일시 |

> [!TIP]
> **선박 등록 로직 제안**:
> 중복 등록 에러를 방지하기 위해 모바일 앱 단에서는 다음 프로세스로 쿼리를 전송합니다.
> 1. 입력된 이름(`:vessel_name`)으로 `SELECT vessel_id FROM vessel WHERE name = :vessel_name;` 조회 실행.
> 2. 만약 조회가 되지 않는 경우에 한하여 `INSERT INTO vessel (name) VALUES (:vessel_name) ON CONFLICT (name) DO NOTHING RETURNING vessel_id;`를 실행하여 안정적으로 ID를 확보합니다.

---

### 3. `inspection_record` — 검수 기록 ✏️ v1 변경
선박이 반입한 폐어망 마대자루를 거점 현장에서 검수원이 계수한 뒤, 사진을 촬영하여 등록하는 원시 반입 데이터 테이블입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **record_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 검수 건 고유 식별자 |
| **site_id** | UUID | ✅ | `FOREIGN KEY` → `site` | 검수가 수행된 거점 ID |
| **vessel_id** | UUID | ✅ | `FOREIGN KEY` → `vessel` | 어망을 반입한 선박 ID |
| **bag_image_url** | TEXT | ✅ | - | 어망 마대자루를 현장에서 실사 촬영한 Cloudinary 이미지 스토리지 URL |
| **bag_count** | INT | ✅ | `CHECK (bag_count > 0)` | 검수된 마대자루의 총 수량. 양수값만 허용. |
| **is_collected** | BOOLEAN | ✅ | `DEFAULT FALSE` | **[안전장치]** 수거 완료 시 자동 갱신되는 원본 수거 상태 플래그 |
| **inspected_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 실제 검수가 시행된 기록 시각 |

* **트리거 연동**: 
  * `INSERT` 시: `trg_enqueue_bags` 트리거가 실행되어 FIFO 재고 관리용 테이블인 `site_bag_queue`에 데이터가 자동으로 입력됩니다.
  * 수거 완료 시: `site_bag_queue`가 차감되며 이 컬럼(`is_collected`)도 `TRUE`로 동기화 마킹됩니다.

---

### 4. `site_bag_queue` — FIFO 재고 큐 ✏️ 번호 동기화
수거 차량이 도달했을 때 가장 오랫동안 방치되었던 어망부터 순서대로 차감(FIFO)할 수 있도록, 검수 단위별 미수거 수량을 정밀 추적하는 백오피스 핵심 관리 테이블입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **queue_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 큐 내역 고유 식별자 |
| **site_id** | UUID | ✅ | `FOREIGN KEY` → `site` | 재고가 잔존하는 거점 ID |
| **record_id** | UUID | ✅ | `FOREIGN KEY` → `inspection_record` | 해당 재고의 원천이 되는 검수 건 ID |
| **original_bag_count** | INT | ✅ | - | 검수 당시 반입된 최초 마대 수량 |
| **remaining_bag_count** | INT | ✅ | `CHECK (remaining_bag_count >= 0)` | 수거 후 아직 남아 있는 실시간 미수거 마대 수량. |
| **bag_image_url** | TEXT | ✅ | - | 대시보드나 상세 보기에서 원본 사진을 빠르게 조회하기 위해 복사 저장된 URL |
| **queued_at** | TIMESTAMPTZ | ✅ | - | FIFO 차감의 기준선 정렬용 타임스탬프. 원천 `inspection_record.inspected_at` 값이 동일하게 주입됩니다. |
| **is_fully_collected** | BOOLEAN | ✅ | `DEFAULT FALSE` | 전량 수거가 완결(`remaining_bag_count = 0`)되었는지의 여부 |

* **추가 제약**: `CHECK (remaining_bag_count <= original_bag_count)` 조건을 통해 남은 수량이 원본 계수량을 초과하여 증식하는 정합성 오류를 원천 차단합니다.

---

### 5. `netspa_manager` — 넷스파 관리자 계정 ✏️ 번호 동기화
계획 수립 권한을 가진 본사 관리자(`admin`)와 현장 수거 차량을 운전하는 기사(`operator`)의 인적 마스터 및 로그인 정보입니다.

| ICON | 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---:|:---|:---|:---:|:---|:---|
| 🔑 | **manager_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 관리자 고유 식별자 |
| | **name** | TEXT | ✅ | - | 관리자/기사 실명 (예: '김기사') |
| | **login_id** | TEXT | ✅ | `UNIQUE` | 웹/앱 로그인 아이디 |
| | **role** | `manager_role` | ✅ | `DEFAULT 'operator'` | 역할 권한 구분 (`admin` 또는 `operator` ENUM 지정) |
| | **password_hash** | TEXT | ✅ | - | 로그인 검증용 비밀번호 단방향 암호화 해시 |
| | **created_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 계정 등록 시각 |

---

### 6. `collection_plan` — 수거 동선 계획 ✏️ 번호 동기화
본사 관리자(`admin`)가 수거 차량이 효율적으로 순회할 수 있도록 날짜별로 거점 목록을 조립한 운행 계획입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **plan_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 수거 계획 고유 ID |
| **manager_id** | UUID | ✅ | `FOREIGN KEY` → `netspa_manager` | 계획을 수립한 관리자 (`admin` 역할자 권한 검증은 앱 레벨에서 실행) |
| **status** | `plan_status` | ✅ | `DEFAULT 'pending'` | 계획의 현황 (`pending` -> `in_progress` -> `completed` / `cancelled`) |
| **planned_at** | TIMESTAMPTZ | ✅ | - | 차량이 거점을 방문하기로 약정된 운행 목표 일시 |

---

### 7. `collection_plan_site` — 계획 대상 거점 (N:M) ✏️ 번호 동기화
수거 계획이 설정되었을 때 방문이 결정된 다수의 거점을 묶어주는 매핑 세부 테이블입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **plan_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `collection_plan` | 대상 수거 계획 ID |
| **site_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `site` | 순회 대상 거점 ID |
| **expected_bag_count** | INT | ❌ | - | **[자동 계산]** 계획 등록(INSERT) 시점 해당 거점의 미수거 재고 합계(`site_bag_queue.remaining_bag_count` 합산). `trg_fill_expected_bag_count` 트리거에 의해 자동으로 산출되어 기록됩니다. |

---

### 8. `collection_record` — 수거 실행 기록 ✏️ v1 주요 연동 및 무게 유연화
계획에 의거하여 차량 기사(`operator`)가 실제 거점을 순회 완료한 뒤 통합 계근한 결과를 기록하는 실적 데이터입니다. 올바로 전자인계서 입력을 위한 정보가 포함됩니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **collection_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 수거 실적 고유 식별자 |
| **plan_id** | UUID | ✅ | `FOREIGN KEY` → `collection_plan` | 연동된 모체 수거 계획 ID (반드시 계획에 귀속됨) |
| **manager_id** | UUID | ✅ | `FOREIGN KEY` → `netspa_manager` | 수거를 실행한 담당 기사 ID (`operator` 권한) |
| **total_weight_kg** | NUMERIC(10,2) | ❌ | `CHECK (total_weight_kg IS NULL OR total_weight_kg > 0)` | **[자동 합산]** 현장에서 개별 거점 무게(`weight_kg`)를 입력하면 `trg_update_collection_total_weight` 트리거에 의해 자동으로 합산되어 갱신됨. |
| **collected_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 수거 운행 완료 일시 |
| **vehicle_number** | TEXT | ❌ | - | 수거 화물차량 번호 (예: '802소4580') |
| **discharger_name** | TEXT | ❌ | - | 폐기물 배출자 (예: '넷스파 주식회사') |
| **transfer_person_name** | TEXT | ❌ | - | 인계담당 직원 성명 |
| **acceptor_name** | TEXT | ❌ | - | 공장 내부 인수담당자 성명 |
| **waste_type_code** | TEXT | ✅ | `DEFAULT '510308'` | 폐기물 분류 코드 (넷스파는 고상 폐어망 단일 항목이므로 `510308` 기본 상수값 강제) |
| **processing_method_code**| TEXT | ❌ | - | 올바로 처리방법 코드 (예: 원료위탁 제조는 '2003', 자가 파쇄는 '1106') |
| **processing_method_name**| TEXT | ❌ | - | 올바로 처리방법 한글 명칭 (예: '(2003)원료 제조(재)(위탁)') |
| **olbaro_doc_number** | TEXT | ❌ | `UNIQUE` | 정부 올바로 전자인계서 시스템에서 수기 등록 후 최종 발급받은 인계 번호 |

---

### 9. `collection_site_detail` — 거점별 수거 실적 상세 ✏️ v1 트리거 고도화
실제 운행 과정 중 각 거점에서 수집 차량에 선적한 구체적 마대 수량과 개별 완료 타임스탬프를 보관합니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **detail_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 실적 상세 고유 식별 ID |
| **collection_id** | UUID | ✅ | `FOREIGN KEY` → `collection_record` | 모체 수거 실적 ID |
| **site_id** | UUID | ✅ | `FOREIGN KEY` → `site` | 어망을 수거해 간 출발 거점 ID |
| **bag_count** | INT | ✅ | `CHECK (bag_count > 0)` | 실제 거점에서 실어 나른 마대자루 수량 |
| **weight_kg** | NUMERIC(10,2) | ❌ | `CHECK (weight_kg IS NULL OR weight_kg > 0)` | 해당 거점에서 실제 계근하여 측정한 실무게. 변경 시 `total_weight_kg`에 자동 합산. |
| **completed_at** | TIMESTAMPTZ | ❌ | - | **[트리거 방아쇠]** 개별 거점 수거 완료 시각. 이 필드가 설정되면 FIFO 차감 및 검수 원본 상태(`is_collected`) 업데이트가 연쇄적으로 작동합니다. |

---

### 10. `processing_batch` — 공정 가공 배치 ✏️ 번호 동기화
공장에 적재된 수거 원료(어망)들을 물리적/화학적 가공(파쇄, 나일론 추출 등) 라인에 투입하기 위해 하나의 대량 묶음(배치) 단위로 조합한 마스터입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **batch_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 공정 배치 고유 ID |
| **status** | `batch_status`| ✅ | `DEFAULT 'assembling'` | 배치 공정 진행 현황 (`assembling` -> `processing` -> `processed`) |
| **total_weight_kg** | NUMERIC(10,2) | ❌ | - | 가공 라인 투입 전 계측한 배치의 실질 총 질량 (배치 확정 시점에 기록) |
| **started_at** | TIMESTAMPTZ | ❌ | - | 원료를 투입하여 가공을 실질적으로 개시한 일시 |
| **processed_at** | TIMESTAMPTZ | ❌ | - | 펠릿 형태로 물리적 공정이 완전히 종료된 일시 |

---

### 11. `batch_collection` — 배치 대상 수거 매핑 (N:M) ✏️ 번호 동기화
하나의 공정 배치에 투입하기 위해 선택된 다수의 수거 실적(`collection_record`) 관계를 설계하는 N:M 연결 다리입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **batch_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `processing_batch` | 대상 공정 배치 ID |
| **collection_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `collection_record` | 조합 대상 수거 실적 ID |

---

### 12. `lot` — 공정 생산 롯트 ✏️ v1 컬럼 확장
하나의 거대한 배치를 공장 세부 설비 사양에 맞추어 여러 개의 개별 드럼 혹은 생산 묶음(`lot`)으로 쪼개어 가공하는 추적 단위입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **lot_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 롯트 고유 식별자 |
| **batch_id** | UUID | ✅ | `FOREIGN KEY` → `processing_batch` | 소속된 상위 공정 배치 ID |
| **lot_number** | INT | ✅ | - | 배치 내에서의 생산 순번 (1부터 오름차순으로 순차 기입) |
| **weight_kg** | NUMERIC(10,2) | ✅ | `CHECK (weight_kg > 0)` | 해당 롯트 묶음의 물리적 무게(kg) |
| **status** | `lot_status` | ✅ | `DEFAULT 'pending'` | 롯트 공정 처리 상태 (`pending` -> `processing` -> `processed`) |
| **started_at** | TIMESTAMPTZ | ❌ | - | 가공 라인 투입 시각 |
| **processed_at** | TIMESTAMPTZ | ❌ | - | 펠릿 완제품 생산 완결 시각 |
| **processing_method_code**| TEXT | ❌ | - | **[v1 확장]** 실제 공정에 적용된 구체적 가공 방식 코드 (올바로 체계 연동) |
| **processing_method_name**| TEXT | ❌ | - | **[v1 확장]** 실제 적용된 가공 명칭 |

* **복합 유니크 제약**: `UNIQUE (batch_id, lot_number)` 조합을 적용하여 하나의 배치 범위 내에서 롯트 번호가 중복 부여되어 생산 데이터가 꼬이는 문제를 사전에 차단합니다.

---

### 13. `lot_composition` — 롯트별 거점 원천 조성비 ✏️ 번호 동기화
생산된 최종 펠릿 제품(`lot`)에 어느 거점(예: 어느 항구)의 원료가 얼마만큼의 기여도(비율 및 추정 질량)로 섞여 들어가 있는지를 수학적으로 분석·저장하는 가치 사슬 추적의 핵심 데이터입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **lot_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `lot` | 대상 생산 롯트 ID |
| **site_id** | UUID | ✅ | `PRIMARY KEY`<br>`FOREIGN KEY` → `site` | 원천 기여 거점 ID |
| **weight_kg** | NUMERIC(10,2) | ✅ | - | **[추정 연산 수식]**<br>`lot.weight_kg × (해당 거점의 배출 마대 수 / 배치 내 총 투입 마대 수)` |
| **ratio_pct** | NUMERIC(5,2)  | ✅ | `CHECK (ratio_pct > 0 AND ratio_pct <= 100)` | **[비율 연산 수식]**<br>`(해당 거점 배출 마대 수 × 100) / 배치 내 총 투입 마대 수` |

* **자동화 로직**: 이 테이블의 모든 행은 개발자가 수동으로 채우지 않고, 배치 확정 시점에 데이터베이스 시스템 함수인 `fn_compute_lot_composition(batch_id)`를 실행하여 물리적으로 일괄 계산 및 자동 생성됩니다.

---

### 14. `monthly_archive` — 월간 아카이브 ✨ Phase 2 기초 설계
월 단위의 누적 실적과 실물 검수 이미지를 종합하여 리포트용 아카이브 데이터를 영구 보존하는 테이블입니다.

| 컬럼명 | 데이터 타입 | 필수 여부 | 제약 조건 | 설명 / 비즈니스 규칙 |
|:---|:---|:---:|:---|:---|
| **archive_id** | UUID | ✅ | `PRIMARY KEY`<br>`DEFAULT gen_random_uuid()` | 아카이브 레코드 고유 ID |
| **year_month** | CHAR(7) | ✅ | `UNIQUE` | 집계 기준 월 지정 포맷 (예: '2025-06'). 중복 생성 원천 차단. |
| **collage_url** | TEXT | ❌ | - | 당월에 축적된 거점별 수거 사진들을 Pillow 라이브러리로 하나의 타일식 이미지로 합성한 뒤 Cloudinary에 올린 웹 주소 URL |
| **total_bag_count** | BIGINT | ❌ | - | 해당 월 전체를 통틀어 집하장에 반입·검수 완료된 전체 마대 수량 합산 |
| **total_weight_kg** | NUMERIC(12,2) | ❌ | - | 해당 월에 완료된 누적 계근 수거 무게의 총합(kg) |
| **active_site_count** | INT | ❌ | - | 해당 월 범위 동안 검수 또는 수거 실적이 발생한 활성 집하장의 순수 개수 |
| **created_at** | TIMESTAMPTZ | ✅ | `DEFAULT now()` | 아카이브 배치 생성 시각 |

---

## ⚡ 트리거 (Trigger) 아키텍처 및 내부 알고리즘

데이터 무결성과 현장 담당자의 입력 오류를 제거하기 위해 데이터베이스 커널 단에서 강력한 절차적 트리거를 작동시킵니다.

### 1. `trg_enqueue_bags` (검수 즉시 FIFO 대기열 자동 진입)
* **대상 테이블**: `inspection_record`
* **동작 시점**: `AFTER INSERT`
* **수행 로직 (`fn_enqueue_bags`)**:
  새로운 검수 보고서가 접수되는 즉시, 해당 검수량(`bag_count`)과 현장 사진(`bag_image_url`)을 그대로 복사하여 `site_bag_queue` 테이블에 새로운 재고 큐 항목으로 입력합니다. 이때 `queued_at` 값은 검수 완료일시(`inspected_at`)로 일치시켜 정확한 입고 선입선출(FIFO)의 타임 기준을 세웁니다.
  ```sql
  -- 내부 동작 메커니즘
  INSERT INTO site_bag_queue (site_id, record_id, original_bag_count, remaining_bag_count, bag_image_url, queued_at)
  VALUES (NEW.site_id, NEW.record_id, NEW.bag_count, NEW.bag_count, NEW.bag_image_url, NEW.inspected_at);
  ```

### 2. `trg_fill_expected_bag_count` (수거 동선 등록 시 실시간 재고 선반영)
* **대상 테이블**: `collection_plan_site`
* **동작 시점**: `BEFORE INSERT`
* **수행 로직 (`fn_fill_expected_bag_count`)**:
  넷스파 본사 계획자가 수거 계획 대상 거점을 배정하는 즉시, 데이터베이스는 `site_bag_queue`에서 `is_fully_collected = FALSE` 상태인 해당 거점의 모든 미수거 잔여량을 합산(`COALESCE(SUM(remaining_bag_count), 0)`)하여 `expected_bag_count`에 자동으로 주입합니다. 이를 통해 수기 작성 없이 방문 당시의 예측량을 완벽히 파악할 수 있습니다.

### 3. `trg_dequeue_bags_fifo` (수거 완료 시 FIFO 재고 자동 차감) ✏️ v1 고도화
* **대상 테이블**: `collection_site_detail`
* **동작 시점**: `AFTER INSERT OR UPDATE`
* **발동 필터 요건 (`fn_dequeue_bags_fifo`)**:
  * **INSERT 시**: 새로운 수거 상세 데이터가 등록될 때 이미 수거 완료 일시(`completed_at`)가 명시되어 있는 경우. (One-step 앱 처리 지원)
  * **UPDATE 시**: 기존의 예약 대기 건(`completed_at IS NULL`)에 현장 방문 완료 플래그(`completed_at IS NOT NULL`)가 등록되는 순간.
* **내부 차감 알고리즘**:
  1. 기사가 수거 완료한 마대 수량(`v_to_deduct = NEW.bag_count`)을 변수에 할당합니다.
  2. 해당 거점의 재고 큐(`site_bag_queue`)를 가장 오래 방치된 검수 건부터 정렬(`ORDER BY queued_at ASC`)하여 한 줄씩 순회합니다.
  3. `LEAST(v_to_deduct, 큐의 잔존량)` 계산을 통해 차감 가용한 질량을 계산합니다.
  4. 재고 큐의 `remaining_bag_count`를 계산된 양만큼 뺄셈 처리하고, 남은 재고가 0이 되면 `is_fully_collected`를 `TRUE`로 갱신합니다.
  5. 만약 해당 거점의 데이터베이스 재고 장부보다 실제 현장에서 퍼 올린 수거량이 초과하여 `v_to_deduct` 잔여물이 남을 경우, 에러로 시스템을 멈추어 현장을 마비시키지 않고 `RAISE WARNING` 메시지를 로그에 투사하며 정상 완결시키는 유연한 예외 처리 설계를 채택했습니다.

### 4. `trg_update_collection_total_weight` (거점 무게 자동 합산)
* **대상 테이블**: `collection_site_detail`
* **동작 시점**: `AFTER INSERT OR UPDATE OF weight_kg OR DELETE`
* **수행 로직 (`fn_update_collection_total_weight`)**:
  담당자가 각 거점을 순회하며 수거한 실제 마대 무게(`weight_kg`)를 기입하거나 수정할 때마다, 즉각적으로 동일한 수거 건(`collection_id`)에 속한 모든 거점 무게를 합산(`SUM(weight_kg)`)하여 모체인 `collection_record.total_weight_kg`에 자동으로 덮어씌웁니다. 백엔드 개입 없이 완벽한 총합 데이터 정합성을 유지합니다.

---

## 🔧 비즈니스 함수 (Function) 연산 설계

### `fn_compute_lot_composition(p_batch_id UUID)`
공장에서 최종 펠릿 가공 롯트가 생성되면 본사 ERP에 의해 본 연산 함수가 격발됩니다.

#### 1. 수학적 계산 원리
이 배치에 귀속된 다수 수거 실적에서 발생한 거점별 누적 마대 합계를 구하여 전체 배치 투입량 대비 비율을 계산합니다.
$$\text{거점 기여 비율}(\text{ratio\_pct}) = \frac{\text{해당 거점의 총 수거 마대 수}}{\text{배치 내 전체 거점의 총 수거 마대 수}} \times 100$$
$$\text{롯트 내 거점 추정 질량}(\text{weight\_kg}) = \text{lot.weight\_kg} \times \left( \frac{\text{해당 거점의 총 수거 마대 수}}{\text{배치 내 전체 거점의 총 수거 마대 수}} \right)$$

#### 2. 예외 처리 및 정밀도 보정
* 배합에 기여한 원료 상세가 존재하지 않는 유령 배치일 경우 즉각 `RAISE EXCEPTION` 오류를 호출하여 이상 공정을 차단합니다.
* 부동소수점 오차에 대비하여 소수점 둘째 자리에서 반올림 처리(`ROUND(..., 2)`)를 완벽하게 보장합니다.
* 만약 기존에 잘못 계산되었던 기록이 남아 있다면 충돌 없이 최신 데이터로 실시간 업데이트를 처리하도록 `ON CONFLICT (lot_id, site_id) DO UPDATE` 설계를 탑재했습니다.

---

## 📊 뷰(View) 8종 구조 및 계산 공식 명세

백엔드 API 및 프론트엔드 대시보드의 연동 속도와 코드 재사용성을 극대화하기 위해 계산 로직이 통합된 8종의 전용 데이터베이스 뷰를 서비스합니다.

### ── Phase 1 핵심 뷰 (5종) ──

#### 1. `v_site_dashboard` — 실시간 거점 모니터링 통합 뷰
* **용도**: 웹 관리자 메인 지도/대시보드 패널 연동. 거점별 실시간 미수거 잔량 및 누적 실적 1건으로 통합 반환.
* **컬럼 상세 명세**:

| 컬럼명 | 원천 테이블 및 계산 공식 | 상세 설명 |
|:---|:---|:---|
| **site_id** | `site.site_id` | 거점 고유 ID |
| **site_name**| `site.name` | 거점(항구) 명칭 |
| **region** | `site.region` | 자치 지역 |
| **address** | `site.address` | 주소 정보 |
| **latitude** | `site.latitude` | 위도 좌표 |
| **longitude**| `site.longitude` | 경도 좌표 |
| **current_bag_count** | `COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0)` | **[실시간 계산]** 아직 차량이 가져가지 않은 거점의 미수거 재고 자루 수 총합 |
| **last_collected_at** | `MAX(csd.completed_at)` | **[실시간 계산]** 수거 차량이 가장 최근에 방문 완료를 누른 일시 |
| **total_inspection_count** | `COUNT(DISTINCT ir.record_id)` | **[실시간 계산]** 해당 거점에서 선박이 입항하여 완료한 총 누적 검수 횟수 |
| **total_bag_count_cumulative** | `COALESCE(SUM(ir.bag_count), 0)` | **[실시간 계산]** 서비스 오픈 이래 해당 거점에서 검수 반입된 누적 어망 마대 총합 |

---

#### 2. `v_site_pending_bag_images` — 대시보드 디테일 큐 뷰
* **용도**: 특정 거점을 클릭했을 때, 미수거된 어망의 실사 촬영 타일 이미지를 FIFO 순서대로 슬라이딩 쇼 형태로 제공.
* **출처 조건**: `site_bag_queue` 테이블 조인, 아직 전량 수거가 완결되지 않은 행(`is_fully_collected = FALSE`)에 국한하여 가장 오래 방치된 순(`ORDER BY queued_at ASC`)으로 제공.

---

#### 3. `v_collection_composition` — 수거 건별 가중치 무게 추정 뷰
* **용도**: 여러 항구를 훑고 돌아온 차량 계근 무게(`total_weight_kg`)를 마대 비율로 해체하여 개별 거점 실적으로 자동 분배.
* **핵심 수학적 가중 분배 수식**:
  $$\text{거점별 가중 기여 비율}(\text{ratio\_pct}) = \frac{\text{csd.bag\_count} \times 100}{\sum (\text{csd.bag\_count})_{\text{collection\_id}}}$$
  $$\text{거점별 추정 수거 질량}(\text{estimated\_weight\_kg}) = \frac{\text{cr.total\_weight\_kg} \times \text{csd.bag\_count}}{\sum (\text{csd.bag\_count})_{\text{collection\_id}}}$$
* **예외 안정장치**: 수거가 막 출발하여 아직 계근되지 않은 초기 상태(`total_weight_kg IS NULL`)인 경우 또는 나누기 오류 방지를 위해 분모에 `NULLIF(..., 0)` 처리를 탑재하여 어떠한 상황에서도 쿼리가 중단되지 않습니다.

---

#### 4. `v_olbaro_export` — 올바로 전송/대시보드 전용 뷰 ✏️ v1 매핑
* **용도**: 정부 올바로 시스템에 제출해야 할 모든 포맷 데이터를 실제 고지용어 컬럼명 별칭과 상태값으로 조인 가공하여 제공.
* **컬럼 상세 매핑 매뉴얼**:

| 올바로 노출 한글 컬럼명 | 원천 시스템 데이터 매핑 관계 및 기본값 규칙 |
|:---|:---|
| **인계서번호** | `collection_record.olbaro_doc_number` (제출 전엔 NULL) |
| **폐기물코드** | `collection_record.waste_type_code` (항상 '510308') |
| **폐기물종류** | 고정 상수텍스트 `'폐어망(고상)'` |
| **배출자** | `collection_record.discharger_name` |
| **배출자인계일자** | `collection_record.collected_at` 의 DATE 포맷 정제 |
| **인계자명** | `collection_record.transfer_person_name` |
| **위탁량_kg** | 계근 완료된 `collection_record.total_weight_kg` 실질 무게 |
| **운반자명** | `netspa_manager.name` (수거를 실행한 operator 실명) |
| **차량번호** | `collection_record.vehicle_number` |
| **인수일자** | `collection_record.collected_at` 의 DATE 포맷 정제 |
| **인수량_kg** | 위탁량과 동일 매핑 처리 |
| **인수자명** | `collection_record.acceptor_name` |
| **처리방법코드** | `collection_record.processing_method_code` |
| **처리방법명** | `collection_record.processing_method_name` |
| **올바로등록상태**| `olbaro_doc_number`가 `NULL`이면 `'미등록'`, 값이 들어있으면 `'등록완료'` 가상 칼럼 처리 |

---

#### 5. `v_lot_site_breakdown` — 완제품 추적 뷰
* **용도**: 특정 완성된 펠릿 롯트(`lot`) 바코드를 스캔했을 때 제품을 구성하는 원료가 어느 항구에서 얼마만큼 온 것인지 투명하게 분해 표시.
* **출처 조건**: `lot` - `lot_composition` - `site` 테이블을 정합적으로 연동하여, 비율이 가장 높은 순서(`ORDER BY lc.ratio_pct DESC`)로 롯트 기여도를 자동 표시.

---

### ── Phase 2 기초 뷰 (3종) ──

#### 6. `v_site_active_status` — 거점 실시간 활성화 분석 뷰
* **용도**: 관리자 대화형 지도 레이어에서 방치된 비활성 집하장을 차별적으로 시각화하기 위한 백엔드 분석 소스.
* **활성 상태 판단 기준 공식**:
  최근 30일 이내에 해당 집하장에서 검수 기록(`inspection_record`)이 단 1건이라도 발생했는지 여부를 기준으로 삼습니다.
  $$\text{is\_active} = \begin{cases} \mathbf{TRUE} & \text{if } \max(\text{ir.inspected\_at}) \ge \text{now()} - \text{INTERVAL '30 days'} \\ \mathbf{FALSE} & \text{otherwise} \end{cases}$$

#### 7. `v_site_inspection_images` — 거점 썸네일 이력 뷰
* **용도**: Phase 2 지도 팝업 클릭 시 거점 내부의 어망 상태 및 반입 실물 역사를 썸네일 이미지 그리드로 나열해주기 위한 고속 쿼리 뷰.
* **동작 규칙**: `inspection_record` 이미지 기록을 거점별로 묶어 시간 역순(`ORDER BY inspected_at DESC`)으로 튜플 변환하여 프론트엔드에 송출.

#### 8. `v_summary_stats` — 최상단 대시보드 요약 지표 집계 뷰
* **용도**: 본사 관리자가 대시보드 진입 시 상단에 노출되는 빅 카드 4종의 통계를 데이터베이스 레벨에서 실시간 롤업(Roll-up)하여 제공.
* **집계 지표 공식**:
  * `total_weight_kg_cumulative`: 현재까지 수거 완료된 전체 계근 중량 총합.
  * `this_month_weight_kg`: 당월(`DATE_TRUNC('month', collected_at) = 당월`)에만 거둬들인 수거 중량 총합.
  * `total_site_count`: 전체 등록 거점 수.
  * `active_site_count`: 최근 30일 내에 반입 이력이 잡힌 실질 작동 거점의 유니크 수.
  * `total_bag_count_cumulative`: 역사적으로 검수 계수된 전체 마대 수량 누계.

---

## 📐 Phase 1 전체 운영 흐름 시나리오

1. **거점 로그인**: 태블릿을 구비한 거점 검수원이 본인의 집하장 코드(`site_code`)와 설정된 6자리 간소화 PIN 번호(`pin_hash`)를 입력하여 다이렉트 로그인합니다.
2. **검수 등록**: 선박이 입항하여 반입된 어망 마대 사진을 찍고 수량(예: 20자루)을 입력하여 `inspection_record`를 저장합니다.
   * `[DB 트리거]` `trg_enqueue_bags`가 자동 작동하여 `site_bag_queue`에 '20자루 미수거 잔량'을 FIFO 큐 형태로 신규 추가합니다.
3. **수거 계획 수립**: 본사 관리자(`admin`)가 수거 노선(계획)을 기획하여 `collection_plan` 및 방문 대상 거점인 `collection_plan_site`를 설정합니다.
   * `[DB 트리거]` `trg_fill_expected_bag_count`가 즉각 연동되어 현재 시점 그 거점들에 방치된 실시간 재고량을 예측량 필드에 스냅샷으로 자동 채워 넣습니다.
4. **수거 차량 출발**: 현장 수거 운반 기사(`operator`)가 태블릿에서 배정된 계획을 확인하고 출발하면 `collection_record` 실적이 무게 `NULL` 값 상태로 우선 생성됩니다.
5. **거점별 수거 처리**: 차량이 현장에 방문하여 마대를 적재하고 현장에서 계근한 무게(`weight_kg`)를 입력하여 거점별 완료 처리(`collection_site_detail.completed_at = now()`)를 수행합니다.
   * `[DB 트리거]` `trg_dequeue_bags_fifo`가 작동하여 FIFO 재고를 차감하고, `inspection_record`에도 안전하게 완료 플래그(`is_collected = TRUE`)를 찍습니다.
   * `[DB 트리거]` `trg_update_collection_total_weight`가 작동하여, 지금까지 측정한 거점 무게들을 모두 더해 전체 수거량(`total_weight_kg`)을 자동으로 업데이트합니다.
6. **올바로 등록**: 수거 일정이 모두 종료되면, 본사 관리자는 `v_olbaro_export` 뷰를 열어 자동으로 계산된 최종 무게 정보를 포함한 내역을 올바로 전자인계서 시스템에 등록한 후 수령한 문서 번호를 `olbaro_doc_number`에 저장해 등록 절차를 끝냅니다.
7. **공정 투입 및 조성비 추적**: 공장 담당자가 원료 투입을 위한 배치를 잡고 가공 완료를 처리한 뒤 `fn_compute_lot_composition(batch_id)`를 실행하면, 해당 펠릿 제품이 어느 항구의 마대 비율로부터 뽑아져 나온 화학 제품인지 추정 비율이 `lot_composition` 테이블에 계산 완료되어 영구히 저장됩니다.

---

## 💡 주요 설계 결정 사항 (Rationale)

* **무게 자동 합산(`total_weight_kg`) 아키텍처**:
  기존에는 공장 통합 계근 방식을 상정했으나, 현장 개별 계근 방식으로 고도화함에 따라 `collection_site_detail` 단위로 무게를 입력받고, `total_weight_kg`는 DB 트리거를 통해 100% 자동 산출되도록 설계하여 앱이나 서버의 산술 부담을 없애고 무결성을 확보했습니다.
* **`site` 로그인 구조 단순화**:
  기존의 복잡한 개별 검수원(`inspector`) 계정 테이블을 전면 삭제하고, 거점 자체에 ID와 단 6자리의 숫자식 PIN 번호 암호화 데이터(`pin_hash`)를 저장함으로써 단일 계정만으로 현장에서 극히 손쉽고 안전하게 검증되도록 구현 비용을 낮췄습니다.
* **초과 수거에 대한 경고식 경량 차감 설계**:
  현장의 수거 마대 수 계산 미스 등으로 재고 큐에 남아 있는 장부상 자루 수보다 실제 트럭에 실어 나른 수량이 더 많은 상태가 발생하더라도, 하드웨어적 예외 오류(`EXCEPTION`)를 발생시켜 기사의 단말기 연동을 멈추게 하지 않고, 경량의 `WARNING` 메시지만 남긴 채 최대한 차감 가용한 재고 큐를 모두 비운 후 거래를 완결하도록 설계하여 현장 업무 연속성을 담보했습니다.
