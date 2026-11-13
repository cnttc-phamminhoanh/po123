/**
 * Vật liệu PO2A theo logic cũ:
 * - tìm các mã F của style, các dòng SO hợp lệ, season và size group;
 * - lấy tiền mua NPL từ MRP / pur_plan / pur_order;
 * - với COMMON-999 chia trực tiếp theo tổng SL SO;
 * - với size group khác, chia tiền theo định mức BOM và số lượng từng size.
 *
 * Tham số truyền vào: p_style, p_season, p_size_grp.
 * Kết quả trả về: m1, m2, m3, opa, qty (USD/pcs).
 */
export const SQL_PO2A_MATERIAL = `
SET NOCOUNT ON;

DECLARE @style    VARCHAR(60) = @p_style;
DECLARE @season   VARCHAR(30) = @p_season;
DECLARE @size_grp VARCHAR(30) = @p_size_grp;

SET @style    = REPLACE(LTRIM(RTRIM(@style)), ' ', '');
SET @size_grp = NULLIF(LTRIM(RTRIM(@size_grp)), '');
SET @season   = NULLIF(LTRIM(RTRIM(@season)), '');

DECLARE @is_haddad bit = 0;
DECLARE @style_key VARCHAR(60);
DECLARE @g VARCHAR(30);
DECLARE @cust_name NVARCHAR(255);
DECLARE @lvl int = 0;

DROP TABLE IF EXISTS #cand, #fcand, #fg, #so, #so_sz, #sg_sz, #grp_n, #sz_best,
  #line_n, #line_grp, #q0, #q, #bq_todo, #bq_done, #bq_sheet, #bl, #use,
  #b2, #plans, #rate, #po, #money, #res, #out;

CREATE TABLE #out (
  size_grp VARCHAR(30),
  qty float,
  m1 float,
  m2 float,
  m3 float,
  opa float
);

-- 0. PO1 của style
SELECT
  pn.sheet_no,
  pn.sheet_sta,
  LTRIM(RTRIM(pn.terms)) AS terms,
  pn.season,
  pn.check_date,
  CASE WHEN c.cust_name1 LIKE '%HADDAD%' THEN 1 ELSE 0 END AS is_haddad
INTO #cand
FROM sal_po_costing1 pn WITH (NOLOCK)
JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
WHERE pn.sheet_type = 'POCGGI'
  AND (
    (
      c.cust_name1 LIKE '%HADDAD%'
      AND LEFT(REPLACE(pn.def04, ' ', ''), 8) = LEFT(@style, 8)
    )
    OR (
      c.cust_name1 NOT LIKE '%HADDAD%'
      AND REPLACE(pn.def04, ' ', '') = @style
    )
  );

SELECT TOP 1 @is_haddad = is_haddad FROM #cand;
IF @size_grp IS NOT NULL DELETE FROM #cand WHERE terms <> @size_grp;

SET @g = @size_grp;
IF @g IS NULL
BEGIN
  IF EXISTS (SELECT 1 FROM #cand WHERE terms = 'COMMON-999')
     AND EXISTS (SELECT 1 FROM #cand WHERE terms <> 'COMMON-999')
    SELECT TOP 1 @g = terms
    FROM #cand
    ORDER BY check_date DESC, sheet_no DESC;
  ELSE IF EXISTS (SELECT 1 FROM #cand WHERE terms <> 'COMMON-999')
    SELECT TOP 1 @g = terms
    FROM #cand
    WHERE terms <> 'COMMON-999'
    ORDER BY TRY_CAST(SUBSTRING(terms, CHARINDEX('-', terms) + 1, 10) AS INT), terms;
  ELSE
    SET @g = 'COMMON-999';
END;

SET @style_key = CASE WHEN @is_haddad = 1 THEN LEFT(@style, 8) ELSE @style END;

-- 1a. Các mã F của style
SELECT
  g.goods_no,
  g.goods_model,
  g.mat_type
INTO #fcand
FROM bas_goods g WITH (NOLOCK)
WHERE g.bar_no LIKE LEFT(@style_key, 6) + '%'
  AND g.goods_no LIKE 'F%'
  AND LEN(g.goods_no) > 10
  AND (
    (@is_haddad = 1 AND REPLACE(g.bar_no, ' ', '') LIKE @style_key + '%')
    OR (@is_haddad = 0 AND REPLACE(g.bar_no, ' ', '') = @style_key)
  )
OPTION (RECOMPILE);

CREATE UNIQUE CLUSTERED INDEX ix ON #fcand (goods_no);

-- 1b. Các dòng SO hợp lệ của các mã F
SELECT
  s.sheet_no AS so_no,
  s.sheet_id AS so_id,
  s.goods_no AS f_goods,
  s.sheet_qty,
  s1.sheet_date,
  LTRIM(RTRIM(ISNULL(f.goods_model, ''))) AS season_so,
  f.mat_type,
  c.cust_name1 AS cust_name,
  s.qty01 q01, s.qty02 q02, s.qty03 q03, s.qty04 q04,
  s.qty05 q05, s.qty06 q06, s.qty07 q07, s.qty08 q08,
  s.qty09 q09, s.qty10 q10, s.qty11 q11, s.qty12 q12,
  s.qty13 q13, s.qty14 q14, s.qty15 q15, s.qty16 q16,
  bc.qty_c01 c01, bc.qty_c02 c02, bc.qty_c03 c03, bc.qty_c04 c04,
  bc.qty_c05 c05, bc.qty_c06 c06, bc.qty_c07 c07, bc.qty_c08 c08,
  bc.qty_c09 c09, bc.qty_c10 c10, bc.qty_c11 c11, bc.qty_c12 c12,
  bc.qty_c13 c13, bc.qty_c14 c14, bc.qty_c15 c15, bc.qty_c16 c16
INTO #so
FROM #fcand f
JOIN sal_order2 s WITH (NOLOCK) ON s.goods_no = f.goods_no
JOIN sal_order1 s1 WITH (NOLOCK) ON s1.sheet_no = s.sheet_no
LEFT JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = s1.cust_no1
LEFT JOIN bas_base_code bc WITH (NOLOCK)
  ON bc.code_type = '070' AND bc.base_code = f.mat_type
WHERE s1.sheet_type IN ('SOGI', 'SOCGI')
  AND s1.sheet_sta = '1'
  AND s.sheet_sta = '1'
  AND ISNULL(s1.cust_no1, '') <> '10003'
  AND UPPER(REPLACE(ISNULL(s1.cust_ord_no, ''), ' ', '')) NOT IN ('GISTOCK', N'GI库存')
  AND LEFT(s.sheet_no, 3) <> 'SOD'
  AND (s.close_type IS NULL OR LEFT(s.close_type, 1) <> '1')
OPTION (RECOMPILE);

DROP TABLE #fcand;

-- Season: không nhập thì lấy season của SO mới nhất
IF @season IS NULL
  SELECT TOP 1 @season = season_so
  FROM #so
  ORDER BY sheet_date DESC, so_no DESC;

DELETE FROM #so WHERE season_so <> ISNULL(@season, '');

CREATE CLUSTERED INDEX ix ON #so (so_no, so_id, f_goods);

SELECT DISTINCT f_goods, mat_type INTO #fg FROM #so;
CREATE CLUSTERED INDEX ix ON #fg (f_goods);

SELECT TOP 1 @cust_name = cust_name FROM #so WHERE cust_name IS NOT NULL;

-- 3. Tiền đơn mua (USD) theo mã F x NPL
SELECT
  r.goods_no0 AS f_goods,
  r.goods_no AS mat_no,
  CASE LEFT(r.goods_no, 1)
    WHEN 'M' THEN LEFT(r.goods_no, 2)
    ELSE LEFT(r.goods_no, 1)
  END AS mat_cat,
  p.sheet_no AS plan_no,
  p.sheet_id AS plan_id
INTO #b2
FROM #fg f
JOIN mrp_mrp2 r WITH (NOLOCK) ON r.goods_no0 = f.f_goods
JOIN pur_plan2 p WITH (NOLOCK) ON p.mrp_no = r.sheet_no AND p.mrp_id = r.sheet_id
WHERE r.need_plan_qty > 0
  AND (LEFT(r.goods_no, 2) IN ('M1', 'M2', 'M3') OR LEFT(r.goods_no, 1) = 'B')
OPTION (RECOMPILE);

CREATE CLUSTERED INDEX ix ON #b2 (plan_no, plan_id);

SELECT DISTINCT plan_no, plan_id INTO #plans FROM #b2;
CREATE CLUSTERED INDEX ix ON #plans (plan_no, plan_id);

SELECT
  acc_period,
  MAX(CASE WHEN cur_code = 'USD' THEN cur_rate END) AS usd,
  MAX(CASE WHEN cur_code = 'RMB' THEN cur_rate END) AS rmb,
  MAX(CASE WHEN cur_code = 'HKD' THEN cur_rate END) AS hkd
INTO #rate
FROM bas_cur_acc WITH (NOLOCK)
WHERE cur_code IN ('USD', 'RMB', 'HKD')
GROUP BY acc_period;

CREATE CLUSTERED INDEX ix ON #rate (acc_period);

SELECT
  o.plan_no,
  o.plan_id,
  SUM(CASE o1.cur_no
    WHEN 'USD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis
    WHEN 'VND' THEN o.sheet_qty * o.sheet_pri * o.pri_dis / x.usd
    WHEN 'RMB' THEN o.sheet_qty * o.sheet_pri * o.pri_dis / (x.usd / x.rmb)
    WHEN 'HKD' THEN o.sheet_qty * o.sheet_pri * o.pri_dis / (x.usd / x.hkd)
  END) AS po_usd
INTO #po
FROM #plans b
JOIN pur_order2 o WITH (NOLOCK) ON o.plan_no = b.plan_no AND o.plan_id = b.plan_id
JOIN pur_order1 o1 WITH (NOLOCK) ON o1.sheet_no = o.sheet_no
LEFT JOIN #rate x ON x.acc_period = CONVERT(char(6), o1.sheet_date, 112)
GROUP BY o.plan_no, o.plan_id
OPTION (RECOMPILE);

CREATE CLUSTERED INDEX ix ON #po (plan_no, plan_id);
DROP TABLE #plans;

SELECT
  b.f_goods,
  b.mat_no,
  b.mat_cat,
  SUM(po.po_usd) AS usd
INTO #money
FROM #b2 b
JOIN #po po ON po.plan_no = b.plan_no AND po.plan_id = b.plan_id
GROUP BY b.f_goods, b.mat_no, b.mat_cat;

CREATE CLUSTERED INDEX ix ON #money (f_goods, mat_no);

IF @g = 'COMMON-999'
BEGIN
  INSERT INTO #out
  SELECT
    'COMMON-999',
    (SELECT SUM(sheet_qty) FROM #so),
    SUM(CASE WHEN mat_cat = 'M1' THEN usd END),
    SUM(CASE WHEN mat_cat = 'M2' THEN usd END),
    SUM(CASE WHEN mat_cat = 'M3' THEN usd END),
    SUM(CASE WHEN mat_cat = 'B' THEN usd END)
  FROM #money;
END
ELSE
BEGIN
  -- 4. Định nghĩa size group
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
    AND @cust_name LIKE '%' + RTRIM(g.cust_name) + '%'
    AND NOT (@is_haddad = 1 AND g.size_grp = 'HADDAD-12')
    AND v.sz IS NOT NULL
    AND LTRIM(RTRIM(v.sz)) <> '';

  CREATE CLUSTERED INDEX ix ON #sg_sz (sz, size_grp);

  SELECT size_grp, COUNT(DISTINCT sz) AS n_def
  INTO #grp_n
  FROM #sg_sz
  GROUP BY size_grp;

  SELECT sz, size_grp
  INTO #sz_best
  FROM (
    SELECT
      gs.sz,
      gs.size_grp,
      ROW_NUMBER() OVER (
        PARTITION BY gs.sz
        ORDER BY gn.n_def, gs.size_grp
      ) AS rn
    FROM #sg_sz gs
    JOIN #grp_n gn ON gn.size_grp = gs.size_grp
  ) x
  WHERE rn = 1;

  CREATE CLUSTERED INDEX ix ON #sz_best (sz);

  -- 5. Size có qty của từng dòng SO
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

  CREATE CLUSTERED INDEX ix ON #so_sz (so_no, so_id, f_goods);
  CREATE NONCLUSTERED INDEX ix2 ON #so_sz (sz) INCLUDE (so_no, so_id, f_goods);

  SELECT so_no, so_id, f_goods, COUNT(DISTINCT sz) AS n_sz
  INTO #line_n
  FROM #so_sz
  GROUP BY so_no, so_id, f_goods;

  CREATE CLUSTERED INDEX ix ON #line_n (so_no, so_id, f_goods);

  -- 6a. Dòng có một nhóm phủ đủ: chọn nhóm hẹp nhất
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
      c.so_no,
      c.so_id,
      c.f_goods,
      c.size_grp,
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

  CREATE CLUSTERED INDEX ix ON #line_grp (so_no, so_id, f_goods);

  -- 6b. Dòng còn lại: từng size vào nhóm hẹp nhất
  SELECT
    z.f_goods,
    z.idx,
    COALESCE(lg.size_grp, sb.size_grp, '(NONE)') AS size_grp,
    z.qty
  INTO #q0
  FROM #so_sz z
  LEFT JOIN #line_grp lg
    ON lg.so_no = z.so_no
    AND lg.so_id = z.so_id
    AND lg.f_goods = z.f_goods
  LEFT JOIN #sz_best sb ON sb.sz = z.sz;

  SELECT f_goods, idx, size_grp, SUM(qty) AS qty
  INTO #q
  FROM #q0
  GROUP BY f_goods, idx, size_grp;

  CREATE CLUSTERED INDEX ix ON #q (f_goods, idx);

  -- 7. BOM: mỗi cấp tra một lần
  CREATE TABLE #bq_todo (parent_no varchar(30) PRIMARY KEY);
  CREATE TABLE #bq_done (parent_no varchar(30) PRIMARY KEY);
  CREATE TABLE #bq_sheet (parent_no varchar(30), sheet_no varchar(20), lvl int);

  INSERT #bq_todo SELECT f_goods FROM #fg;

  WHILE @lvl < 6 AND EXISTS (SELECT 1 FROM #bq_todo)
  BEGIN
    SET @lvl += 1;
    INSERT #bq_done SELECT parent_no FROM #bq_todo;

    INSERT #bq_sheet (parent_no, sheet_no, lvl)
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
    INSERT #bq_todo
    SELECT DISTINCT x.child_no
    FROM #bq_sheet s
    JOIN bom_stru2 x WITH (NOLOCK) ON x.sheet_no = s.sheet_no
    WHERE s.lvl = @lvl
      AND NOT EXISTS (
        SELECT 1 FROM #bq_done d WHERE d.parent_no = x.child_no
      );
  END;

  SELECT parent_no, child_no, idx, f
  INTO #bl
  FROM (
    SELECT
      s.parent_no,
      x.child_no,
      v.idx,
      CAST(
        (CASE WHEN v.q <> 0 THEN v.q ELSE x.qty / NULLIF(x.bas_qty, 0) END)
        * (1 + x.dis_rate)
        AS float
      ) AS f
    FROM (
      SELECT DISTINCT parent_no, sheet_no FROM #bq_sheet
    ) s
    JOIN bom_stru2 x WITH (NOLOCK) ON x.sheet_no = s.sheet_no
    CROSS APPLY (VALUES
      (1, x.qty01), (2, x.qty02), (3, x.qty03), (4, x.qty04),
      (5, x.qty05), (6, x.qty06), (7, x.qty07), (8, x.qty08),
      (9, x.qty09), (10, x.qty10), (11, x.qty11), (12, x.qty12),
      (13, x.qty13), (14, x.qty14), (15, x.qty15), (16, x.qty16)
    ) v(idx, q)
    WHERE v.idx IN (SELECT DISTINCT idx FROM #q)
  ) y
  WHERE ISNULL(f, 0) <> 0;

  CREATE CLUSTERED INDEX ix ON #bl (parent_no, idx);

  ;WITH t AS (
    SELECT
      f.f_goods,
      l.child_no,
      l.idx,
      l.f AS cum,
      1 AS lvl
    FROM #fg f
    JOIN #bl l ON l.parent_no = f.f_goods
    UNION ALL
    SELECT
      t.f_goods,
      l.child_no,
      t.idx,
      t.cum * l.f,
      t.lvl + 1
    FROM t
    JOIN #bl l ON l.parent_no = t.child_no AND l.idx = t.idx
    WHERE t.lvl < 6
  )
  SELECT
    f_goods,
    child_no AS mat_no,
    idx,
    SUM(cum) AS usage
  INTO #use
  FROM t
  WHERE LEFT(child_no, 1) IN ('M', 'B')
  GROUP BY f_goods, child_no, idx
  OPTION (MAXRECURSION 10);

  CREATE CLUSTERED INDEX ix ON #use (f_goods, mat_no, idx);

  -- 8. Chia tiền theo nhóm
  ;WITH need AS (
    SELECT
      m.f_goods,
      m.mat_no,
      m.mat_cat,
      m.usd,
      q.size_grp,
      SUM(q.qty * ISNULL(u.usage, 0)) AS need,
      SUM(q.qty) AS qty
    FROM #money m
    JOIN #q q ON q.f_goods = m.f_goods
    LEFT JOIN #use u
      ON u.f_goods = m.f_goods
      AND u.mat_no = m.mat_no
      AND u.idx = q.idx
    GROUP BY m.f_goods, m.mat_no, m.mat_cat, m.usd, q.size_grp
  ),
  a AS (
    SELECT
      *,
      SUM(need) OVER (PARTITION BY f_goods, mat_no) AS tn,
      SUM(qty) OVER (PARTITION BY f_goods, mat_no) AS tq
    FROM need
  )
  SELECT
    size_grp,
    mat_cat,
    SUM(usd * CASE WHEN tn > 0 THEN need / tn ELSE qty / NULLIF(tq, 0) END) AS usd
  INTO #res
  FROM a
  GROUP BY size_grp, mat_cat;

  INSERT INTO #out
  SELECT
    @g,
    (SELECT SUM(qty) FROM #q WHERE size_grp = @g),
    SUM(CASE WHEN mat_cat = 'M1' THEN usd END),
    SUM(CASE WHEN mat_cat = 'M2' THEN usd END),
    SUM(CASE WHEN mat_cat = 'M3' THEN usd END),
    SUM(CASE WHEN mat_cat = 'B' THEN usd END)
  FROM #res
  WHERE size_grp = @g;
END;

-- KẾT QUẢ (USD/pcs)
SELECT
  @style AS cust_style,
  @season AS season,
  size_grp,
  qty,
  ISNULL(m1, 0) / NULLIF(qty, 0) AS m1,
  ISNULL(m2, 0) / NULLIF(qty, 0) AS m2,
  ISNULL(m3, 0) / NULLIF(qty, 0) AS m3,
  ISNULL(opa, 0) / NULLIF(qty, 0) AS opa,
  (
    ISNULL(m1, 0) + ISNULL(m2, 0) + ISNULL(m3, 0) + ISNULL(opa, 0)
  ) / NULLIF(qty, 0) AS m_ttl
FROM #out;
`;
