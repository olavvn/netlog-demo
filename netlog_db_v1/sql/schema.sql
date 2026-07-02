-- ============================================================
-- NETLOG PostgreSQL DDL  v2
-- ============================================================

-- ============================================================
-- ENUM 타입 정의
-- ============================================================

CREATE TYPE manager_role AS ENUM ('admin', 'operator');
CREATE TYPE bag_status AS ENUM ('stored', 'processing', 'processed');

-- collection_record 상태 (planned: 수거 예정 등록, in_progress: 수거 중)
CREATE TYPE collection_record_status AS ENUM (
    'planned',
    'in_progress',
    'completed',
    'stacking_pending',
    'stacked'
);

-- [v2 추가] processing_bundle 상태
CREATE TYPE bundle_status AS ENUM (
    'ready',
    'in_progress',
    'completed'
);

-- ============================================================
-- 테이블 생성
-- ============================================================

CREATE TABLE site (
    site_id    UUID         NOT NULL DEFAULT gen_random_uuid(),
    site_code  TEXT         NOT NULL,
    name       TEXT         NOT NULL,
    region     TEXT         NOT NULL,
    address    TEXT         NULL,
    latitude   NUMERIC(9,6) NOT NULL,
    longitude  NUMERIC(9,6) NOT NULL,
    pin_hash   TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_site PRIMARY KEY (site_id),
    CONSTRAINT uq_site_code UNIQUE (site_code)
);

CREATE TABLE vessel (
    vessel_id  UUID        NOT NULL DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_vessel      PRIMARY KEY (vessel_id),
    CONSTRAINT uq_vessel_name UNIQUE (name)
);

CREATE TABLE inspection_record (
    record_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id          UUID        NOT NULL REFERENCES site(site_id),
    vessel_id        UUID        NOT NULL REFERENCES vessel(vessel_id),
    bag_image_url    TEXT        NOT NULL,
    bag_count        INT         NOT NULL CHECK (bag_count > 0),
    ai_estimated_count INT       NULL,
    is_collected     BOOLEAN     NOT NULL DEFAULT FALSE,
    inspected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_bag_queue (
    queue_id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    site_id             UUID        NOT NULL,
    record_id           UUID        NOT NULL,
    original_bag_count  INT         NOT NULL,
    remaining_bag_count INT         NOT NULL,
    bag_image_url       TEXT        NOT NULL,
    queued_at           TIMESTAMPTZ NOT NULL,
    is_fully_collected  BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_site_bag_queue          PRIMARY KEY (queue_id),
    CONSTRAINT chk_remaining_non_negative CHECK (remaining_bag_count >= 0),
    CONSTRAINT chk_remaining_lte_original CHECK (remaining_bag_count <= original_bag_count)
);

CREATE TABLE netspa_manager (
    manager_id    UUID         NOT NULL DEFAULT gen_random_uuid(),
    name          TEXT         NOT NULL,
    login_id      TEXT         NOT NULL,
    role          manager_role NOT NULL DEFAULT 'operator',
    password_hash TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_netspa_manager   PRIMARY KEY (manager_id),
    CONSTRAINT uq_manager_login_id UNIQUE (login_id)
);

CREATE TABLE collection_record (
    collection_id          UUID                     NOT NULL DEFAULT gen_random_uuid(),
    manager_id             UUID                     NOT NULL,
    planned_at             TIMESTAMPTZ              NULL,
    total_weight_kg        NUMERIC(10,2)            NULL,
    collected_at           TIMESTAMPTZ              NULL,
    vehicle_number         TEXT                     NULL,
    discharger_name        TEXT                     NULL,
    transfer_person_name   TEXT                     NULL,
    acceptor_name          TEXT                     NULL,
    waste_type_code        TEXT                     NOT NULL DEFAULT '510308',
    processing_method_code TEXT                     NULL,
    processing_method_name TEXT                     NULL,
    olbaro_doc_number      TEXT                     NULL,
    status                 collection_record_status NOT NULL DEFAULT 'planned',
    CONSTRAINT pk_collection_record        PRIMARY KEY (collection_id),
    CONSTRAINT uq_olbaro_doc_number        UNIQUE (olbaro_doc_number),
    CONSTRAINT chk_weight_positive_or_null CHECK (total_weight_kg IS NULL OR total_weight_kg > 0)
);

COMMENT ON COLUMN collection_record.status IS
    '수거 기록 상태. planned→in_progress→completed→stacking_pending→stacked 순서로만 전이 가능. completed 전환 시 collected_at 자동 기록';
COMMENT ON COLUMN collection_record.collected_at IS
    '실제 수거 완료 시각. status=completed 전환 시 트리거가 자동 설정하므로 직접 입력 불필요';

CREATE TABLE collection_site_detail (
    detail_id        UUID          NOT NULL DEFAULT gen_random_uuid(),
    collection_id    UUID          NOT NULL,
    site_id          UUID          NOT NULL,
    bag_count        INT           NOT NULL,
    actual_bag_count INT           NULL,
    weight_kg        NUMERIC(10,2) NULL,
    completed_at     TIMESTAMPTZ   NULL,
    CONSTRAINT pk_collection_site_detail PRIMARY KEY (detail_id),
    CONSTRAINT chk_detail_bag_pos        CHECK (bag_count >= 0),
    CONSTRAINT chk_detail_weight_pos     CHECK (weight_kg IS NULL OR weight_kg > 0)
);

CREATE TABLE rack (
    rack_code    VARCHAR(10) NOT NULL,
    max_capacity INT         NOT NULL DEFAULT 50,
    CONSTRAINT pk_rack PRIMARY KEY (rack_code)
);

INSERT INTO rack (rack_code, max_capacity) VALUES
('A', 50), ('B', 50), ('C', 50), ('D', 50);

CREATE TABLE processing_bundle (
    bundle_id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    bag_count              INT         NOT NULL,
    processed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_method_code TEXT        NULL,
    processing_method_name TEXT        NULL,
    -- [v2 추가]
    status                 bundle_status NOT NULL DEFAULT 'ready',
    CONSTRAINT pk_processing_bundle PRIMARY KEY (bundle_id),
    CONSTRAINT chk_bundle_bag_count CHECK (bag_count > 0)
);

COMMENT ON COLUMN processing_bundle.status IS
    '공정 번들 상태. ready: 투입 전 / in_progress: 진행 중 / completed: 공정 완료';

CREATE TABLE bag (
    bag_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
    serial_number TEXT        NOT NULL,
    collection_id UUID        NOT NULL,
    site_id       UUID        NOT NULL,
    rack_code     VARCHAR(10) NULL,
    status        bag_status  NOT NULL DEFAULT 'stored',
    stored_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    bundle_id     UUID        NULL,
    CONSTRAINT pk_bag        PRIMARY KEY (bag_id),
    CONSTRAINT uq_bag_serial UNIQUE (serial_number)
);

CREATE TABLE monthly_archive (
    archive_id        UUID          NOT NULL DEFAULT gen_random_uuid(),
    year_month        CHAR(7)       NOT NULL,
    collage_url       TEXT          NULL,
    total_bag_count   BIGINT        NULL,
    total_weight_kg   NUMERIC(12,2) NULL,
    active_site_count INT           NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_monthly_archive    PRIMARY KEY (archive_id),
    CONSTRAINT uq_monthly_year_month UNIQUE (year_month)
);

-- ============================================================
-- 외래키
-- (원본과 동일, 생략 없이 전체 포함)
-- ============================================================

ALTER TABLE site_bag_queue
    ADD CONSTRAINT fk_site_bag_queue_site   FOREIGN KEY (site_id)   REFERENCES site (site_id);
ALTER TABLE site_bag_queue
    ADD CONSTRAINT fk_site_bag_queue_record FOREIGN KEY (record_id) REFERENCES inspection_record (record_id);

ALTER TABLE collection_record
    ADD CONSTRAINT fk_collection_record_manager FOREIGN KEY (manager_id) REFERENCES netspa_manager (manager_id);

ALTER TABLE collection_site_detail
    ADD CONSTRAINT fk_collection_site_detail_collection FOREIGN KEY (collection_id) REFERENCES collection_record (collection_id);
ALTER TABLE collection_site_detail
    ADD CONSTRAINT fk_collection_site_detail_site       FOREIGN KEY (site_id)       REFERENCES site (site_id);

ALTER TABLE bag
    ADD CONSTRAINT fk_bag_collection FOREIGN KEY (collection_id) REFERENCES collection_record (collection_id);
ALTER TABLE bag
    ADD CONSTRAINT fk_bag_site       FOREIGN KEY (site_id)       REFERENCES site (site_id);
ALTER TABLE bag
    ADD CONSTRAINT fk_bag_rack       FOREIGN KEY (rack_code)     REFERENCES rack (rack_code);
ALTER TABLE bag
    ADD CONSTRAINT fk_bag_bundle     FOREIGN KEY (bundle_id)     REFERENCES processing_bundle (bundle_id);

-- ============================================================
-- 트리거
-- ============================================================

CREATE OR REPLACE FUNCTION fn_enqueue_bags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO site_bag_queue (
        site_id, record_id, original_bag_count,
        remaining_bag_count, bag_image_url, queued_at
    ) VALUES (
        NEW.site_id, NEW.record_id, NEW.bag_count,
        NEW.bag_count, NEW.bag_image_url, NEW.inspected_at
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_bags
AFTER INSERT ON inspection_record
FOR EACH ROW EXECUTE FUNCTION fn_enqueue_bags();

-- collection_site_detail INSERT 시 bag_count를 site_bag_queue의 현재 잔여량 합계로 자동 채움
CREATE OR REPLACE FUNCTION fn_fill_bag_count_from_queue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    SELECT COALESCE(SUM(remaining_bag_count), 0)
    INTO   NEW.bag_count
    FROM   site_bag_queue
    WHERE  site_id            = NEW.site_id
      AND  is_fully_collected = FALSE;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fill_bag_count_from_queue
BEFORE INSERT ON collection_site_detail
FOR EACH ROW EXECUTE FUNCTION fn_fill_bag_count_from_queue();

-- collection_record.status → 'completed' 전환 시 해당 사이트들의 큐를 전량 차감
CREATE OR REPLACE FUNCTION fn_zero_queue_on_completed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
        UPDATE site_bag_queue
        SET    remaining_bag_count = 0,
               is_fully_collected  = TRUE
        WHERE  site_id IN (
                   SELECT site_id
                   FROM   collection_site_detail
                   WHERE  collection_id = NEW.collection_id
               )
          AND  is_fully_collected = FALSE;

        UPDATE inspection_record
        SET    is_collected = TRUE
        WHERE  record_id IN (
                   SELECT q.record_id
                   FROM   site_bag_queue q
                   WHERE  q.site_id IN (
                              SELECT site_id
                              FROM   collection_site_detail
                              WHERE  collection_id = NEW.collection_id
                          )
               );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_zero_queue_on_completed
AFTER UPDATE OF status ON collection_record
FOR EACH ROW EXECUTE FUNCTION fn_zero_queue_on_completed();

-- status 전이 순서 강제: planned→in_progress→completed→stacking_pending→stacked
-- completed 전환 시 collected_at = now() 자동 설정
CREATE OR REPLACE FUNCTION fn_enforce_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT (
            (OLD.status = 'planned'          AND NEW.status = 'in_progress'     ) OR
            (OLD.status = 'in_progress'      AND NEW.status = 'completed'       ) OR
            (OLD.status = 'completed'        AND NEW.status = 'stacking_pending') OR
            (OLD.status = 'stacking_pending' AND NEW.status = 'stacked'         )
        ) THEN
            RAISE EXCEPTION
                'Invalid status transition for collection_record: % -> %',
                OLD.status, NEW.status;
        END IF;

        IF NEW.status = 'completed' THEN
            NEW.collected_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_status_transition
BEFORE UPDATE OF status ON collection_record
FOR EACH ROW EXECUTE FUNCTION fn_enforce_status_transition();

CREATE OR REPLACE FUNCTION fn_update_collection_total_weight()
RETURNS TRIGGER AS $$
DECLARE v_collection_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN v_collection_id := OLD.collection_id;
    ELSE v_collection_id := NEW.collection_id; END IF;

    UPDATE collection_record
    SET total_weight_kg = (
        SELECT SUM(weight_kg) FROM collection_site_detail WHERE collection_id = v_collection_id
    )
    WHERE collection_id = v_collection_id;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_collection_total_weight
AFTER INSERT OR UPDATE OF weight_kg OR DELETE ON collection_site_detail
FOR EACH ROW EXECUTE FUNCTION fn_update_collection_total_weight();

-- ============================================================
-- 뷰 (v3 반영 전 상태 — v_site_dashboard는 Alembic V003으로 관리)
-- ============================================================

CREATE VIEW v_site_dashboard AS
SELECT
    s.site_id,
    s.name                                              AS site_name,
    s.region,
    s.address,
    s.latitude,
    s.longitude,
    COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0)
                                                        AS current_bag_count,
    MAX(csd.completed_at)                               AS last_collected_at,
    CASE
        WHEN MAX(csd.completed_at) IS NULL THEN NULL
        ELSE EXTRACT(DAY FROM now() - MAX(csd.completed_at))::INTEGER
    END                                                 AS waiting_days,
    CASE
        WHEN COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0) <= 100
            THEN 'green'
        WHEN COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0) <= 200
            THEN 'yellow'
        ELSE 'red'
    END                                                 AS bag_status,
    COUNT(DISTINCT ir.record_id)                        AS total_inspection_count,
    COALESCE(SUM(ir.bag_count), 0)                      AS total_bag_count_cumulative
FROM      site s
LEFT JOIN site_bag_queue          q   ON q.site_id   = s.site_id
LEFT JOIN collection_site_detail  csd ON csd.site_id = s.site_id
LEFT JOIN inspection_record       ir  ON ir.site_id  = s.site_id
GROUP BY  s.site_id, s.name, s.region, s.address, s.latitude, s.longitude;

-- 나머지 뷰는 원본과 동일
CREATE VIEW v_site_pending_bag_images AS
SELECT q.site_id, s.name AS site_name, q.queue_id, q.record_id,
       q.bag_image_url, q.original_bag_count, q.remaining_bag_count, q.queued_at
FROM  site_bag_queue q
JOIN  site s ON s.site_id = q.site_id
WHERE q.is_fully_collected = FALSE
ORDER BY q.site_id, q.queued_at ASC;

CREATE VIEW v_collection_composition AS
SELECT cr.collection_id, cr.collected_at, cr.total_weight_kg,
       csd.site_id, s.name AS site_name, csd.bag_count,
       ROUND(csd.bag_count * 100.0 / SUM(csd.bag_count) OVER (PARTITION BY cr.collection_id), 2) AS ratio_pct,
       csd.weight_kg AS actual_weight_kg
FROM  collection_record cr
JOIN  collection_site_detail csd ON csd.collection_id = cr.collection_id
JOIN  site s ON s.site_id = csd.site_id;

CREATE VIEW v_olbaro_export AS
SELECT cr.collection_id,
       cr.olbaro_doc_number AS "인계서번호", cr.waste_type_code AS "폐기물코드",
       '폐어망(고상)' AS "폐기물종류", cr.discharger_name AS "배출자",
       cr.collected_at::DATE AS "배출자인계일자", cr.transfer_person_name AS "인계자명",
       cr.total_weight_kg AS "위탁량_kg", m.name AS "운반자명",
       cr.vehicle_number AS "차량번호", cr.collected_at::DATE AS "인수일자",
       cr.total_weight_kg AS "인수량_kg", cr.acceptor_name AS "인수자명",
       cr.processing_method_code AS "처리방법코드", cr.processing_method_name AS "처리방법명",
       CASE WHEN cr.olbaro_doc_number IS NULL THEN '미등록' ELSE '등록완료' END AS "올바로등록상태"
FROM  collection_record cr
JOIN  netspa_manager m ON m.manager_id = cr.manager_id
ORDER BY cr.collected_at DESC;

CREATE VIEW v_bundle_site_breakdown AS
SELECT pb.bundle_id, pb.processed_at, pb.bag_count AS bundle_total_bag_count,
       b.site_id, s.name AS site_name, COUNT(b.bag_id) AS bag_count,
       ROUND(COUNT(b.bag_id) * 100.0 / NULLIF(SUM(COUNT(b.bag_id)) OVER (PARTITION BY pb.bundle_id), 0), 2) AS ratio_pct
FROM processing_bundle pb
JOIN bag b ON b.bundle_id = pb.bundle_id
JOIN site s ON s.site_id = b.site_id
GROUP BY pb.bundle_id, pb.processed_at, pb.bag_count, b.site_id, s.name;

CREATE VIEW v_site_active_status AS
SELECT s.site_id, s.name AS site_name, s.region, s.latitude, s.longitude,
       CASE WHEN MAX(ir.inspected_at) >= now() - INTERVAL '30 days' THEN TRUE ELSE FALSE END AS is_active,
       MAX(ir.inspected_at) AS last_inspection_at,
       MAX(csd.completed_at) AS last_collected_at,
       COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0) AS current_bag_count
FROM      site s
LEFT JOIN inspection_record      ir  ON ir.site_id  = s.site_id
LEFT JOIN collection_site_detail csd ON csd.site_id = s.site_id
LEFT JOIN site_bag_queue         q   ON q.site_id   = s.site_id
GROUP BY  s.site_id, s.name, s.region, s.latitude, s.longitude;

CREATE VIEW v_site_inspection_images AS
SELECT ir.site_id, s.name AS site_name, ir.record_id,
       ir.bag_image_url, ir.bag_count, ir.inspected_at,
       DATE_TRUNC('month', ir.inspected_at) AS inspection_month
FROM  inspection_record ir
JOIN  site s ON s.site_id = ir.site_id
ORDER BY ir.site_id, ir.inspected_at DESC;

CREATE VIEW v_summary_stats AS
SELECT
    COALESCE(SUM(cr.total_weight_kg), 0) AS total_weight_kg_cumulative,
    COALESCE(SUM(cr.total_weight_kg) FILTER (
        WHERE DATE_TRUNC('month', cr.collected_at) = DATE_TRUNC('month', now())
    ), 0) AS this_month_weight_kg,
    COUNT(DISTINCT s.site_id) AS total_site_count,
    COUNT(DISTINCT s.site_id) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM inspection_record ir2
            WHERE ir2.site_id = s.site_id AND ir2.inspected_at >= now() - INTERVAL '30 days'
        )
    ) AS active_site_count,
    COALESCE(SUM(ir.bag_count), 0) AS total_bag_count_cumulative
FROM      site s
LEFT JOIN collection_record cr ON TRUE
LEFT JOIN inspection_record ir ON TRUE;