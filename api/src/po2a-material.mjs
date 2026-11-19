/**
 * Vật liệu PO2A (giá mua thực tế từ pur_order2).
 *
 * Luồng:
 * - SO hợp lệ của style -> mã F, season, size group.
 * - MRP/MRP3 -> pur_plan -> pur_order2: tiền mua NPL theo từng mã F.
 * - Size group: ưu tiên khớp đúng tên khách; không có mới dùng LIKE.
 *   Dòng không khớp trọn một nhóm size -> COMMON-999.
 * - Nếu mã F chính thiếu tiền, mượn đơn mua của mã F anh em cùng style và
 *   chia theo tỷ lệ sản lượng (@share).
 * - BOM 6 cấp + số lượng SO để phân bổ tiền về size group.
 * - Phân bổ tách theo nguồn tiền P (có SO) / C (forecast) / S (mượn mã F anh em).
 *
 * Kết quả vẫn giữ đúng shape cũ để UI đọc:
 * m1, m2, m3, opa, m_ttl (USD/pcs), material_details (JSON).
 * Bổ sung sib_share và src (NO_PO / ACTUAL / ACTUAL+SIBLING) để biết nguồn tiền.
 *
 * Tham số: p_style, p_season, p_size_grp.
 */
export const SQL_PO2A_MATERIAL = `
SET NOCOUNT ON;

DECLARE @style    varchar(60)  = @p_style;
DECLARE @season   varchar(50)  = @p_season;
DECLARE @size_grp varchar(100) = @p_size_grp;

SET @style    = REPLACE(LTRIM(RTRIM(@style)), ' ', '');
SET @season   = NULLIF(LTRIM(RTRIM(@season)), '');
SET @size_grp = NULLIF(LTRIM(RTRIM(@size_grp)), '');

DECLARE
    @is_haddad bit,
    @is_common bit = 0,
    @len int,
    @s varchar(50),
    @g varchar(100),
    @cust_name nvarchar(255),
    @qty_g numeric(18,4),
    @lvl int = 0,
    @fc_mode int = 2,
    @fc_mode_override int = NULL,
    @q_tgt float,
    @q_sib float,
    @share float = 1;

DROP TABLE IF EXISTS
    #so, #sg_sz, #grp_n, #so_sz, #line_n,
    #line_grp, #q0, #q, #fg, #sib, #sibp, #sibmat, #so_k, #fg_list,
    #mrp_so, #mrp_sh, #den, #mw, #mww, #mwp, #pln, #rate, #po, #pos,
    #money, #bq_todo, #bq_done, #bq_sheet, #bl, #use, #alloc_detail, #alloc, #detail;

SET @fc_mode = ISNULL(@fc_mode_override, 2);
SET @is_common = CASE WHEN @size_grp = 'COMMON-999' THEN 1 ELSE 0 END;

/* 1. LẤY SO THEO STYLE */
CREATE TABLE #so (
    so_no varchar(20),
    so_id int,
    f_goods varchar(30),
    season varchar(50),
    cust_no varchar(20),
    cust_name nvarchar(255),
    bar_no varchar(100),
    sheet_qty numeric(18,8),
    sheet_date datetime,
    q01 numeric(18,8), q02 numeric(18,8), q03 numeric(18,8), q04 numeric(18,8),
    q05 numeric(18,8), q06 numeric(18,8), q07 numeric(18,8), q08 numeric(18,8),
    q09 numeric(18,8), q10 numeric(18,8), q11 numeric(18,8), q12 numeric(18,8),
    q13 numeric(18,8), q14 numeric(18,8), q15 numeric(18,8), q16 numeric(18,8),
    c01 varchar(50), c02 varchar(50), c03 varchar(50), c04 varchar(50),
    c05 varchar(50), c06 varchar(50), c07 varchar(50), c08 varchar(50),
    c09 varchar(50), c10 varchar(50), c11 varchar(50), c12 varchar(50),
    c13 varchar(50), c14 varchar(50), c15 varchar(50), c16 varchar(50)
);

INSERT INTO #so
SELECT
    s.sheet_no, s.sheet_id, s.goods_no,
    LTRIM(RTRIM(ISNULL(g.goods_model, ''))),
    s1.cust_no1, c.cust_name1,
    REPLACE(g.bar_no, ' ', ''),
    s.sheet_qty, s1.sheet_date,
    s.qty01, s.qty02, s.qty03, s.qty04,
    s.qty05, s.qty06, s.qty07, s.qty08,
    s.qty09, s.qty10, s.qty11, s.qty12,
    s.qty13, s.qty14, s.qty15, s.qty16,
    bc.qty_c01, bc.qty_c02, bc.qty_c03, bc.qty_c04,
    bc.qty_c05, bc.qty_c06, bc.qty_c07, bc.qty_c08,
    bc.qty_c09, bc.qty_c10, bc.qty_c11, bc.qty_c12,
    bc.qty_c13, bc.qty_c14, bc.qty_c15, bc.qty_c16
FROM sal_order2 s WITH (NOLOCK)
JOIN sal_order1 s1 WITH (NOLOCK)
    ON s1.sheet_no = s.sheet_no
JOIN bas_goods g WITH (NOLOCK)
    ON g.goods_no = s.goods_no
LEFT JOIN bas_cust c WITH (NOLOCK)
    ON c.cust_no = s1.cust_no1
OUTER APPLY (
    SELECT TOP 1
        b.qty_c01, b.qty_c02, b.qty_c03, b.qty_c04,
        b.qty_c05, b.qty_c06, b.qty_c07, b.qty_c08,
        b.qty_c09, b.qty_c10, b.qty_c11, b.qty_c12,
        b.qty_c13, b.qty_c14, b.qty_c15, b.qty_c16
    FROM bas_base_code b WITH (NOLOCK)
    WHERE b.code_type = '070'
      AND b.base_code = g.mat_type
) bc
WHERE REPLACE(g.bar_no, ' ', '') LIKE LEFT(@style, 8) + '%'
  AND s1.sheet_type IN ('SOGI', 'SOCGI')
  AND s1.sheet_sta = '1'
  AND s.sheet_sta = '1'
  AND (s.close_type IS NULL OR LEFT(s.close_type, 1) <> '1')
  AND LEFT(s.goods_no, 1) = 'F'
  AND ISNULL(s1.cust_no1, '') <> '10003'
  AND ISNULL(s1.cust_ord_no, '') NOT IN ('GISTOCK', N'GI库存')
  AND LEFT(s1.sheet_no, 3) <> 'SOD';

SET @is_haddad = CASE WHEN EXISTS (
    SELECT 1 FROM #so
    WHERE cust_no IN ('10015', '10110')
       OR cust_name LIKE '%HADDAD%'
) THEN 1 ELSE 0 END;

SET @len = CASE WHEN @is_haddad = 1 THEN 8 ELSE 60 END;

DELETE FROM #so
WHERE LEFT(bar_no, @len) <> LEFT(@style, @len);

IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
    RETURN;
END;

SET @s = @season;
IF @s IS NULL
    SELECT TOP 1 @s = season
    FROM #so
    ORDER BY sheet_date DESC, so_no DESC;
SET @s = ISNULL(@s, '');

DELETE FROM #so WHERE ISNULL(season, '') <> @s;
IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
    RETURN;
END;

SELECT TOP 1 @cust_name = cust_name
FROM #so
WHERE cust_name IS NOT NULL;

CREATE CLUSTERED INDEX IX_so ON #so(so_no, so_id, f_goods);

SELECT DISTINCT f_goods INTO #fg FROM #so;
CREATE UNIQUE CLUSTERED INDEX IX_fg ON #fg(f_goods);

SELECT DISTINCT so_no, so_id, f_goods INTO #so_k FROM #so;
CREATE UNIQUE CLUSTERED INDEX IX_so_k ON #so_k(so_no, so_id, f_goods);

SELECT DISTINCT f_goods INTO #fg_list FROM #so;
CREATE UNIQUE CLUSTERED INDEX IX_fg_list ON #fg_list(f_goods);

/* 1c. Mã F anh em cùng 8 ký tự đầu + cùng season, dùng để chia tiền khi mã chính thiếu. */
SELECT g.goods_no AS f_sib
INTO #sib
FROM bas_goods g WITH (NOLOCK)
WHERE g.bar_no LIKE LEFT(@style, 6) + '%'
  AND REPLACE(g.bar_no, ' ', '') LIKE LEFT(@style, 8) + '%'
  AND g.goods_no LIKE 'F%'
  AND LEN(g.goods_no) > 10
  AND LTRIM(RTRIM(ISNULL(g.goods_model, ''))) = @s
  AND g.goods_no NOT IN (SELECT f_goods FROM #fg);

CREATE UNIQUE CLUSTERED INDEX IX_sib ON #sib(f_sib);

SELECT @q_tgt = SUM(sheet_qty) FROM #so;

SELECT @q_sib = SUM(s.sheet_qty)
FROM #sib b
JOIN sal_order2 s WITH (NOLOCK)
    ON s.goods_no = b.f_sib
JOIN sal_order1 s1 WITH (NOLOCK)
    ON s1.sheet_no = s.sheet_no
WHERE s1.sheet_type IN ('SOGI', 'SOCGI')
  AND s1.sheet_sta = '1'
  AND s.sheet_sta = '1'
  AND (s.close_type IS NULL OR LEFT(s.close_type, 1) <> '1')
  AND ISNULL(s1.cust_no1, '') <> '10003'
  AND ISNULL(s1.cust_ord_no, '') NOT IN ('GISTOCK', N'GI库存')
  AND LEFT(s1.sheet_no, 3) <> 'SOD';

SET @share = ISNULL(@q_tgt / NULLIF(@q_tgt + @q_sib, 0), 1);

/* 2. MAP SIZE GROUP */
SELECT
    g.size_grp,
    UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz
INTO #sg_sz
FROM size_grp_gi g WITH (NOLOCK)
CROSS APPLY (VALUES
    (g.size1), (g.size2), (g.size3), (g.size4),
    (g.size5), (g.size6), (g.size7), (g.size8),
    (g.size9), (g.size10), (g.size11), (g.size12),
    (g.size13), (g.size14), (g.size15), (g.size16)
) v(sz)
WHERE RTRIM(g.cust_name) <> 'COMMON'
  AND (
      RTRIM(g.cust_name) = RTRIM(@cust_name)
      OR (
          NOT EXISTS (
              SELECT 1
              FROM size_grp_gi x WITH (NOLOCK)
              WHERE RTRIM(x.cust_name) = RTRIM(@cust_name)
          )
          AND @cust_name LIKE '%' + RTRIM(g.cust_name) + '%'
      )
  )
  AND NOT (@is_haddad = 1 AND g.size_grp = 'HADDAD-12')
  AND v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> '';

CREATE CLUSTERED INDEX IX_sg_sz ON #sg_sz(sz, size_grp);

SELECT size_grp, COUNT(DISTINCT sz) AS n_def
INTO #grp_n
FROM #sg_sz
GROUP BY size_grp;

CREATE UNIQUE CLUSTERED INDEX IX_grp_n ON #grp_n(size_grp);

SELECT
    s.so_no,
    s.so_id,
    s.f_goods,
    v.idx,
    UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz,
    v.q AS qty
INTO #so_sz
FROM #so s
CROSS APPLY (VALUES
    (1, s.q01, s.c01), (2, s.q02, s.c02), (3, s.q03, s.c03), (4, s.q04, s.c04),
    (5, s.q05, s.c05), (6, s.q06, s.c06), (7, s.q07, s.c07), (8, s.q08, s.c08),
    (9, s.q09, s.c09), (10, s.q10, s.c10), (11, s.q11, s.c11), (12, s.q12, s.c12),
    (13, s.q13, s.c13), (14, s.q14, s.c14), (15, s.q15, s.c15), (16, s.q16, s.c16)
) v(idx, q, sz)
WHERE v.q > 0
  AND v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> '';

CREATE CLUSTERED INDEX IX_so_sz ON #so_sz(so_no, so_id, f_goods);

SELECT so_no, so_id, f_goods, COUNT(DISTINCT sz) AS n_sz
INTO #line_n
FROM #so_sz
GROUP BY so_no, so_id, f_goods;

CREATE UNIQUE CLUSTERED INDEX IX_line_n ON #line_n(so_no, so_id, f_goods);

;WITH cover AS (
    SELECT
        z.so_no,
        z.so_id,
        z.f_goods,
        g.size_grp,
        COUNT(DISTINCT z.sz) AS n_matched,
        gn.n_def
    FROM #so_sz z
    JOIN #sg_sz g ON g.sz = z.sz
    JOIN #grp_n gn ON gn.size_grp = g.size_grp
    GROUP BY z.so_no, z.so_id, z.f_goods, g.size_grp, gn.n_def
),
ranked AS (
    SELECT
        c.*,
        ROW_NUMBER() OVER (
            PARTITION BY c.so_no, c.so_id, c.f_goods
            ORDER BY c.n_def, c.size_grp
        ) AS rn
    FROM cover c
    JOIN #line_n ln
        ON ln.so_no = c.so_no
        AND ln.so_id = c.so_id
        AND ln.f_goods = c.f_goods
    WHERE c.n_matched = ln.n_sz
)
SELECT so_no, so_id, f_goods, size_grp
INTO #line_grp
FROM ranked
WHERE rn = 1;

CREATE UNIQUE CLUSTERED INDEX IX_line_grp ON #line_grp(so_no, so_id, f_goods);

SELECT
    z.so_no,
    z.so_id,
    z.f_goods,
    z.idx,
    COALESCE(lg.size_grp, 'COMMON-999') AS size_grp,
    z.qty
INTO #q0
FROM #so_sz z
LEFT JOIN #line_grp lg
    ON lg.so_no = z.so_no
    AND lg.so_id = z.so_id
    AND lg.f_goods = z.f_goods;

INSERT INTO #q0 (so_no, so_id, f_goods, idx, size_grp, qty)
SELECT s.so_no, s.so_id, s.f_goods, 0, 'COMMON-999', s.sheet_qty
FROM #so s
WHERE NOT EXISTS (
    SELECT 1 FROM #so_sz z
    WHERE z.so_no = s.so_no
      AND z.so_id = s.so_id
      AND z.f_goods = s.f_goods
);

CREATE CLUSTERED INDEX IX_q0 ON #q0(so_no, so_id, f_goods, idx);

SELECT size_grp, SUM(qty) AS qty
INTO #q
FROM #q0
GROUP BY size_grp;

CREATE UNIQUE CLUSTERED INDEX IX_q ON #q(size_grp);

/* 3. CHỌN SIZE GROUP */
SET @g = @size_grp;

IF @is_common = 1
BEGIN
    /* COMMON-999 = tổng toàn style, không bắt buộc phải có một nhóm size riêng. */
    SET @qty_g = (SELECT SUM(qty) FROM #q);
END
ELSE IF @g IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM #q WHERE size_grp = @g)
    BEGIN
        RETURN;
    END;
    SELECT @qty_g = qty FROM #q WHERE size_grp = @g;
END
ELSE
BEGIN
    SELECT TOP 1 @g = size_grp
    FROM #q
    WHERE size_grp <> 'COMMON-999'
    ORDER BY
        TRY_CAST(SUBSTRING(size_grp, CHARINDEX('-', size_grp) + 1, 10) AS int),
        size_grp;

    IF @g IS NULL SET @g = 'COMMON-999';

    SELECT @qty_g = qty FROM #q WHERE size_grp = @g;
END;

IF ISNULL(@qty_g, 0) = 0
BEGIN
    RETURN;
END;

/* 4. MRP -> SO / FORECAST */
SELECT sheet_no
INTO #mrp_so
FROM (
    SELECT r3.sheet_no
    FROM mrp_mrp3 r3 WITH (NOLOCK)
    JOIN #so_k s ON s.so_no = r3.ord_no AND s.so_id = r3.ord_id
    UNION
    SELECT r.sheet_no
    FROM mrp_mrp2 r WITH (NOLOCK)
    JOIN #so_k s ON s.so_no = r.ord_no AND s.so_id = r.ord_id
) x;

CREATE UNIQUE CLUSTERED INDEX IX_mrp_so ON #mrp_so(sheet_no);

SELECT sheet_no
INTO #mrp_sh
FROM (
    SELECT sheet_no FROM #mrp_so
    UNION
    SELECT r.sheet_no
    FROM mrp_mrp2 r WITH (NOLOCK)
    JOIN #fg_list f ON f.f_goods = r.goods_no0
    WHERE @fc_mode > 0
      AND NOT EXISTS (SELECT 1 FROM #mrp_so m WHERE m.sheet_no = r.sheet_no)
) x;

CREATE UNIQUE CLUSTERED INDEX IX_mrp_sh ON #mrp_sh(sheet_no);

SELECT r3.sheet_no, r3.child_no, SUM(r3.sheet_qty) AS d_all
INTO #den
FROM mrp_mrp3 r3 WITH (NOLOCK)
JOIN #mrp_sh h ON h.sheet_no = r3.sheet_no
GROUP BY r3.sheet_no, r3.child_no;

CREATE UNIQUE CLUSTERED INDEX IX_den ON #den(sheet_no, child_no);

CREATE TABLE #mw (
    mrp_no varchar(30),
    mrp_id int,
    mat_no varchar(30),
    f_goods varchar(30),
    so_no varchar(30),
    so_id int,
    q3 numeric(28,8),
    ok_f int,
    br char(1)
);

INSERT INTO #mw
SELECT
    r.sheet_no,
    r.sheet_id,
    r.goods_no,
    r.goods_no0,
    ISNULL(r3.ord_no, ''),
    ISNULL(r3.ord_id, 0),
    SUM(r3.sheet_qty),
    CASE WHEN s2.goods_no = r.goods_no0 THEN 1 ELSE 0 END,
    'A'
FROM mrp_mrp2 r WITH (NOLOCK)
JOIN #mrp_sh h ON h.sheet_no = r.sheet_no
JOIN mrp_mrp3 r3 WITH (NOLOCK)
    ON r3.sheet_no = r.sheet_no
    AND r3.child_no = r.goods_no
LEFT JOIN sal_order2 s2 WITH (NOLOCK)
    ON s2.sheet_no = r3.ord_no
    AND s2.sheet_id = r3.ord_id
WHERE r3.sheet_qty > 0
  AND r.need_plan_qty > 0
  AND (r.forecast_no IS NULL OR r.forecast_no = '' OR r.forecast_id IS NULL OR r.forecast_id = 0)
  AND (r.ord_no IS NULL OR r.ord_no = '' OR r.ord_id IS NULL OR r.ord_id = 0)
GROUP BY
    r.sheet_no, r.sheet_id, r.goods_no, r.goods_no0,
    ISNULL(r3.ord_no, ''), ISNULL(r3.ord_id, 0),
    CASE WHEN s2.goods_no = r.goods_no0 THEN 1 ELSE 0 END;

INSERT INTO #mw
SELECT
    r.sheet_no, r.sheet_id, r.goods_no, r.goods_no0,
    r.ord_no, r.ord_id, 1, 1, 'B'
FROM mrp_mrp2 r WITH (NOLOCK)
JOIN #mrp_sh h ON h.sheet_no = r.sheet_no
WHERE r.need_plan_qty > 0
  AND r.ord_no IS NOT NULL AND r.ord_no <> ''
  AND r.ord_id IS NOT NULL AND r.ord_id <> 0;

INSERT INTO #mw
SELECT
    r.sheet_no, r.sheet_id, r.goods_no, r.goods_no0,
    '', 0, 1, 1, 'C'
FROM mrp_mrp2 r WITH (NOLOCK)
JOIN #mrp_sh h ON h.sheet_no = r.sheet_no
WHERE r.need_plan_qty > 0
  AND r.forecast_no IS NOT NULL AND r.forecast_no <> ''
  AND r.forecast_id IS NOT NULL AND r.forecast_id <> 0
  AND NOT (r.ord_no IS NOT NULL AND r.ord_no <> '' AND r.ord_id IS NOT NULL AND r.ord_id <> 0)
  AND NOT EXISTS (
      SELECT 1 FROM #mw x
      WHERE x.mrp_no = r.sheet_no
        AND x.mrp_id = r.sheet_id
        AND x.mat_no = r.goods_no
        AND x.br = 'B'
  );

CREATE CLUSTERED INDEX IX_mw ON #mw(mrp_no, mrp_id, mat_no, br);

SELECT
    m.mrp_no,
    m.mrp_id,
    m.mat_no,
    m.f_goods,
    m.so_no,
    m.so_id,
    CASE WHEN m.br IN ('B', 'C') THEN 1.0 ELSE m.q3 / NULLIF(d.d_all, 0) END AS w_bi,
    CASE
        WHEN m.br IN ('B', 'C') THEN 1.0
        WHEN m.so_no = '' THEN m.q3 / NULLIF(d.d_all, 0)
        WHEN e.q_ok > 0 THEN CASE WHEN m.ok_f = 1 THEN m.q3 / e.q_ok ELSE 0 END
        ELSE m.q3 / NULLIF(d.d_all, 0)
    END AS w
INTO #mww
FROM #mw m
LEFT JOIN #den d
    ON d.sheet_no = m.mrp_no
    AND d.child_no = m.mat_no
LEFT JOIN (
    SELECT mrp_no, mrp_id, SUM(CASE WHEN ok_f = 1 THEN q3 END) AS q_ok
    FROM #mw
    WHERE br = 'A'
    GROUP BY mrp_no, mrp_id
) e
    ON e.mrp_no = m.mrp_no
    AND e.mrp_id = m.mrp_id;

CREATE CLUSTERED INDEX IX_mww ON #mww(mrp_no, mrp_id, mat_no);

/* 5. MRP -> PLAN */
SELECT
    p.sheet_no AS plan_no,
    p.sheet_id AS plan_id,
    w.so_no,
    w.so_id,
    w.f_goods,
    w.mat_no,
    w.w,
    w.w_bi
INTO #mwp
FROM #mww w
JOIN pur_plan2 p WITH (NOLOCK)
    ON p.mrp_no = w.mrp_no
    AND p.mrp_id = w.mrp_id
WHERE EXISTS (
    SELECT 1 FROM #so_k s
    WHERE s.so_no = w.so_no
      AND s.so_id = w.so_id
)
OR (
    w.so_no = ''
    AND @fc_mode > 0
    AND EXISTS (SELECT 1 FROM #fg_list f WHERE f.f_goods = w.f_goods)
);

CREATE CLUSTERED INDEX IX_mwp ON #mwp(plan_no, plan_id);

SELECT DISTINCT plan_no, plan_id INTO #pln FROM #mwp;
CREATE UNIQUE CLUSTERED INDEX IX_pln ON #pln(plan_no, plan_id);

/* 6. TIỀN ĐƠN MUA (PO2A) USD THEO PLAN = pur_order2 */
SELECT
    acc_period,
    MAX(CASE WHEN cur_code = 'USD' THEN cur_rate END) AS usd,
    MAX(CASE WHEN cur_code = 'RMB' THEN cur_rate END) AS rmb,
    MAX(CASE WHEN cur_code = 'HKD' THEN cur_rate END) AS hkd
INTO #rate
FROM bas_cur_acc WITH (NOLOCK)
WHERE cur_code IN ('USD', 'RMB', 'HKD')
GROUP BY acc_period;

CREATE CLUSTERED INDEX IX_rate ON #rate(acc_period);

SELECT
    o.plan_no,
    o.plan_id,
    SUM(CASE o1.cur_no
        WHEN 'USD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
        WHEN 'VND' THEN o.sheet_qty * o.sheet_pri * o.pri_dis / NULLIF(x.usd, 0)
        WHEN 'RMB' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
            / NULLIF(x.usd / NULLIF(x.rmb, 0), 0)
        WHEN 'HKD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
            / NULLIF(x.usd / NULLIF(x.hkd, 0), 0)
    END) AS usd
INTO #po
FROM #pln k
JOIN pur_order2 o WITH (NOLOCK)
    ON o.plan_no = k.plan_no
    AND o.plan_id = k.plan_id
JOIN pur_order1 o1 WITH (NOLOCK)
    ON o1.sheet_no = o.sheet_no
LEFT JOIN #rate x
    ON x.acc_period = CONVERT(char(6), o1.sheet_date, 112)
GROUP BY o.plan_no, o.plan_id;

CREATE UNIQUE CLUSTERED INDEX IX_po ON #po(plan_no, plan_id);

/* 7. CHI PHÍ THEO SO + MÃ VẬT LIỆU (P = có SO, C = forecast) */
SELECT
    w.so_no,
    w.so_id,
    w.f_goods,
    w.mat_no,
    CASE WHEN LEFT(w.mat_no, 1) = 'M' THEN LEFT(w.mat_no, 2) ELSE LEFT(w.mat_no, 1) END AS mat_cat,
    SUM(po.usd * w.w) AS usd,
    CAST(CASE WHEN w.so_no = '' THEN 'C' ELSE 'P' END AS char(1)) AS src
INTO #money
FROM #mwp w
JOIN #po po
    ON po.plan_no = w.plan_no
    AND po.plan_id = w.plan_id
GROUP BY
    w.so_no, w.so_id, w.f_goods, w.mat_no,
    CASE WHEN LEFT(w.mat_no, 1) = 'M' THEN LEFT(w.mat_no, 2) ELSE LEFT(w.mat_no, 1) END,
    CASE WHEN w.so_no = '' THEN 'C' ELSE 'P' END;

CREATE CLUSTERED INDEX IX_money ON #money(so_no, so_id, f_goods, mat_no);

/* 7b. Mã F chính thiếu tiền -> mượn đơn mua của mã F anh em, chia theo @share. */
SELECT DISTINCT
    r.goods_no0 AS f_goods,
    r.goods_no AS mat_no,
    CASE LEFT(r.goods_no, 1)
        WHEN 'M' THEN LEFT(r.goods_no, 2)
        ELSE LEFT(r.goods_no, 1)
    END AS mat_cat
INTO #sibmat
FROM #fg f
JOIN mrp_mrp2 r WITH (NOLOCK)
    ON r.goods_no0 = f.f_goods
WHERE LEFT(r.goods_no, 2) IN ('M1', 'M2', 'M3')
   OR LEFT(r.goods_no, 1) = 'B';

CREATE CLUSTERED INDEX IX_sibmat ON #sibmat(mat_no, f_goods);

SELECT DISTINCT
    t.f_goods,
    t.mat_no,
    t.mat_cat,
    p.sheet_no AS plan_no,
    p.sheet_id AS plan_id
INTO #sibp
FROM #sib sb
JOIN mrp_mrp2 r2 WITH (NOLOCK)
    ON r2.goods_no0 = sb.f_sib
    AND r2.need_plan_qty > 0
JOIN #sibmat t ON t.mat_no = r2.goods_no
JOIN pur_plan2 p WITH (NOLOCK)
    ON p.mrp_no = r2.sheet_no
    AND p.mrp_id = r2.sheet_id
WHERE NOT EXISTS (
    SELECT 1 FROM #money m
    WHERE m.f_goods = t.f_goods
      AND m.mat_no = t.mat_no
      AND ISNULL(m.usd, 0) <> 0
);

CREATE CLUSTERED INDEX IX_sibp ON #sibp(plan_no, plan_id);

SELECT
    o.plan_no,
    o.plan_id,
    SUM(CASE o1.cur_no
        WHEN 'USD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
        WHEN 'VND' THEN o.sheet_qty * o.sheet_pri * o.pri_dis / NULLIF(x.usd, 0)
        WHEN 'RMB' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
            / NULLIF(x.usd / NULLIF(x.rmb, 0), 0)
        WHEN 'HKD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
            / NULLIF(x.usd / NULLIF(x.hkd, 0), 0)
    END) AS usd
INTO #pos
FROM (SELECT DISTINCT plan_no, plan_id FROM #sibp) k
JOIN pur_order2 o WITH (NOLOCK)
    ON o.plan_no = k.plan_no
    AND o.plan_id = k.plan_id
JOIN pur_order1 o1 WITH (NOLOCK)
    ON o1.sheet_no = o.sheet_no
LEFT JOIN #rate x
    ON x.acc_period = CONVERT(char(6), o1.sheet_date, 112)
GROUP BY o.plan_no, o.plan_id;

CREATE UNIQUE CLUSTERED INDEX IX_pos ON #pos(plan_no, plan_id);

INSERT INTO #money (so_no, so_id, f_goods, mat_no, mat_cat, usd, src)
SELECT
    '', 0, b.f_goods, b.mat_no, b.mat_cat,
    SUM(ps.usd) * @share,
    'S'
FROM #sibp b
JOIN #pos ps
    ON ps.plan_no = b.plan_no
    AND ps.plan_id = b.plan_id
GROUP BY b.f_goods, b.mat_no, b.mat_cat;

/* 8. TRUY BOM TỐI ĐA 6 CẤP */
CREATE TABLE #bq_todo (parent_no varchar(30) PRIMARY KEY);
CREATE TABLE #bq_done (parent_no varchar(30) PRIMARY KEY);
CREATE TABLE #bq_sheet (parent_no varchar(30), sheet_no varchar(20), lvl int);

INSERT INTO #bq_todo(parent_no) SELECT f_goods FROM #fg;

WHILE @lvl < 6 AND EXISTS (SELECT 1 FROM #bq_todo)
BEGIN
    SET @lvl += 1;

    INSERT INTO #bq_done(parent_no)
    SELECT t.parent_no
    FROM #bq_todo t
    WHERE NOT EXISTS (SELECT 1 FROM #bq_done d WHERE d.parent_no = t.parent_no);

    INSERT INTO #bq_sheet(parent_no, sheet_no, lvl)
    SELECT parent_no, sheet_no, @lvl
    FROM (
        SELECT
            b.parent_no,
            b.sheet_no,
            ROW_NUMBER() OVER (
                PARTITION BY b.parent_no
                ORDER BY b.check_date DESC, b.sheet_no DESC
            ) AS rn
        FROM bom_stru1 b WITH (NOLOCK)
        JOIN #bq_todo t ON t.parent_no = b.parent_no
        WHERE b.sheet_sta = '1'
    ) x
    WHERE rn = 1;

    DELETE FROM #bq_todo;

    INSERT INTO #bq_todo(parent_no)
    SELECT DISTINCT x.child_no
    FROM #bq_sheet s
    JOIN bom_stru2 x WITH (NOLOCK)
        ON x.sheet_no = s.sheet_no
    WHERE s.lvl = @lvl
      AND NOT EXISTS (
          SELECT 1 FROM #bq_done d WHERE d.parent_no = x.child_no
      );
END;

CREATE CLUSTERED INDEX IX_bq_sheet ON #bq_sheet(parent_no, sheet_no);

/* 9. BOM USAGE THEO SIZE INDEX */
SELECT y.parent_no, y.child_no, y.idx, y.f
INTO #bl
FROM (
    SELECT
        s.parent_no,
        x.child_no,
        v.idx,
        CAST(
            (CASE WHEN ISNULL(v.q, 0) <> 0 THEN v.q ELSE x.qty / NULLIF(x.bas_qty, 0) END)
            * (1 + ISNULL(x.dis_rate, 0))
            AS float
        ) AS f
    FROM (SELECT DISTINCT parent_no, sheet_no FROM #bq_sheet) s
    JOIN bom_stru2 x WITH (NOLOCK) ON x.sheet_no = s.sheet_no
    CROSS APPLY (VALUES
        (1, x.qty01), (2, x.qty02), (3, x.qty03), (4, x.qty04),
        (5, x.qty05), (6, x.qty06), (7, x.qty07), (8, x.qty08),
        (9, x.qty09), (10, x.qty10), (11, x.qty11), (12, x.qty12),
        (13, x.qty13), (14, x.qty14), (15, x.qty15), (16, x.qty16)
    ) v(idx, q)
    WHERE v.idx IN (SELECT DISTINCT idx FROM #q0 WHERE idx > 0)
) y
WHERE ISNULL(y.f, 0) <> 0;

CREATE CLUSTERED INDEX IX_bl ON #bl(parent_no, idx);

;WITH bom_tree AS (
    SELECT
        f.f_goods,
        l.child_no,
        l.idx,
        l.f AS cum_usage,
        1 AS lvl
    FROM #fg f
    JOIN #bl l ON l.parent_no = f.f_goods
    UNION ALL
    SELECT
        t.f_goods,
        l.child_no,
        t.idx,
        t.cum_usage * l.f,
        t.lvl + 1
    FROM bom_tree t
    JOIN #bl l
        ON l.parent_no = t.child_no
        AND l.idx = t.idx
    WHERE t.lvl < 6
)
SELECT
    f_goods,
    child_no AS mat_no,
    idx,
    SUM(cum_usage) AS usage
INTO #use
FROM bom_tree
WHERE LEFT(child_no, 1) IN ('M', 'B')
GROUP BY f_goods, child_no, idx
OPTION (MAXRECURSION 10);

CREATE CLUSTERED INDEX IX_use ON #use(f_goods, mat_no, idx);

/* 10. PHÂN BỔ USD VỀ SIZE GROUP (GỘP THEO MÃ F + NGUỒN TIỀN) */
;WITH qp AS (
    SELECT f_goods, idx, size_grp, SUM(qty) AS qty
    FROM #q0
    GROUP BY f_goods, idx, size_grp
),
mm AS (
    SELECT f_goods, mat_no, mat_cat, src, SUM(usd) AS usd
    FROM #money
    GROUP BY f_goods, mat_no, mat_cat, src
),
need AS (
    SELECT
        m.f_goods,
        m.mat_no,
        m.mat_cat,
        m.src,
        m.usd,
        q.size_grp,
        SUM(q.qty * ISNULL(u.usage, 0)) AS need,
        SUM(q.qty) AS qty
    FROM mm m
    JOIN qp q
        ON q.f_goods = m.f_goods
    LEFT JOIN #use u
        ON u.f_goods = m.f_goods
        AND u.mat_no = m.mat_no
        AND u.idx = q.idx
    GROUP BY
        m.f_goods, m.mat_no, m.mat_cat, m.src, m.usd, q.size_grp
),
allocation_weight AS (
    SELECT
        *,
        SUM(need) OVER (PARTITION BY f_goods, mat_no, src) AS total_need,
        SUM(qty)  OVER (PARTITION BY f_goods, mat_no, src) AS total_qty
    FROM need
)
SELECT
    size_grp,
    mat_no,
    mat_cat,
    src,
    SUM(usd * CASE
        WHEN total_need > 0 THEN need / NULLIF(total_need, 0)
        ELSE qty / NULLIF(total_qty, 0)
    END) AS usd
INTO #alloc_detail
FROM allocation_weight
GROUP BY size_grp, mat_no, mat_cat, src;

CREATE CLUSTERED INDEX IX_alloc_detail ON #alloc_detail(size_grp, mat_no, mat_cat);

SELECT size_grp, mat_cat, src, SUM(usd) AS usd
INTO #alloc
FROM #alloc_detail
GROUP BY size_grp, mat_cat, src;

CREATE CLUSTERED INDEX IX_alloc ON #alloc(size_grp, mat_cat, src);

/* 11. GOM DETAIL THEO ĐÚNG PHẠM VI ĐANG XEM */
CREATE TABLE #detail (
    mat_no varchar(30),
    mat_cat varchar(2),
    usd float
);

IF @is_common = 1
BEGIN
    INSERT INTO #detail
    SELECT mat_no, mat_cat, SUM(usd)
    FROM #alloc_detail
    GROUP BY mat_no, mat_cat;
END
ELSE
BEGIN
    INSERT INTO #detail
    SELECT mat_no, mat_cat, SUM(usd)
    FROM #alloc_detail
    WHERE size_grp = @g
    GROUP BY mat_no, mat_cat;
END;

CREATE CLUSTERED INDEX IX_detail ON #detail(mat_cat, mat_no);

/* 12. KẾT QUẢ (USD/pcs) */
SELECT
    'PO2A' AS po_type,
    @style AS cust_style,
    @s AS season,
    @g AS size_grp,
    @qty_g AS qty,
    @share AS sib_share,
    CASE
        WHEN NOT EXISTS (SELECT 1 FROM #money) THEN 'NO_PO'
        WHEN EXISTS (SELECT 1 FROM #money WHERE src = 'S') THEN 'ACTUAL+SIBLING'
        ELSE 'ACTUAL'
    END AS src,
    a.m1 / NULLIF(@qty_g, 0) AS m1,
    a.m2 / NULLIF(@qty_g, 0) AS m2,
    a.m3 / NULLIF(@qty_g, 0) AS m3,
    a.opa / NULLIF(@qty_g, 0) AS opa,
    a.m_ttl / NULLIF(@qty_g, 0) AS m_ttl,
    (
        SELECT
            CASE d.mat_cat
                WHEN 'M1' THEN 'fabric'
                WHEN 'M2' THEN 'trim'
                WHEN 'M3' THEN 'pack'
                WHEN 'B'  THEN 'opa'
            END AS category,
            d.mat_no AS code,
            ISNULL(g.goods_name, '') AS name,
            d.usd / NULLIF(@qty_g, 0) AS amount
        FROM #detail d
        LEFT JOIN bas_goods g WITH (NOLOCK) ON g.goods_no = d.mat_no
        WHERE d.usd <> 0
          AND d.mat_cat IN ('M1', 'M2', 'M3', 'B')
        FOR JSON PATH
    ) AS material_details
FROM (
    SELECT
        SUM(CASE WHEN mat_cat = 'M1' THEN usd END) AS m1,
        SUM(CASE WHEN mat_cat = 'M2' THEN usd END) AS m2,
        SUM(CASE WHEN mat_cat = 'M3' THEN usd END) AS m3,
        SUM(CASE WHEN mat_cat = 'B'  THEN usd END) AS opa,
        SUM(CASE WHEN mat_cat IN ('M1', 'M2', 'M3', 'B') THEN usd END) AS m_ttl
    FROM #alloc
    WHERE @is_common = 1 OR size_grp = @g
) a;

DROP TABLE IF EXISTS
    #so, #sg_sz, #grp_n, #so_sz, #line_n,
    #line_grp, #q0, #q, #fg, #sib, #sibp, #sibmat, #so_k, #fg_list,
    #mrp_so, #mrp_sh, #den, #mw, #mww, #mwp, #pln, #rate, #po, #pos,
    #money, #bq_todo, #bq_done, #bq_sheet, #bl, #use, #alloc_detail, #alloc, #detail;
`;
