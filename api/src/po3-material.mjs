/**
 * Vật liệu PO3 theo logic cũ.
 * Nguồn tiền: sản xuất thực tế (MO + phiếu xuất scm_out) và giá nhập kho pur_in.
 *
 * Tham số: p_style, p_season, p_size_grp.
 * Kết quả: qty, m1, m2, m3, opa, m_ttl (USD/pcs).
 */
export const SQL_PO3_MATERIAL = `
SET NOCOUNT ON;

DECLARE @style    varchar(60)  = @p_style;
DECLARE @season   varchar(50)  = @p_season;
DECLARE @size_grp varchar(100) = @p_size_grp;

SET @style    = REPLACE(LTRIM(RTRIM(@style)), ' ', '');
SET @season   = NULLIF(LTRIM(RTRIM(@season)), '');
SET @size_grp = NULLIF(LTRIM(RTRIM(@size_grp)), '');

DECLARE
  @is_haddad bit,
  @len int,
  @s varchar(50),
  @g varchar(100),
  @cust_name nvarchar(255),
  @has_size bit;

DROP TABLE IF EXISTS
  #so, #sg, #sg_sz, #grp_n, #so_sz, #line_n, #line_grp,
  #so_sg0, #so_sg, #mo, #mo_key, #mo_tot, #mo_sz,
  #iss, #isz, #price, #bom, #alloc, #r;

CREATE TABLE #so (
  so_no varchar(20), so_id int, f_goods varchar(30), season varchar(50),
  cust_no varchar(20), cust_name nvarchar(255), bar_no varchar(100),
  sheet_qty numeric(18,8), sheet_date datetime,
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
  s1.cust_no1, c.cust_name1, REPLACE(g.bar_no, ' ', ''),
  s.sheet_qty, s1.sheet_date,
  s.qty01, s.qty02, s.qty03, s.qty04, s.qty05, s.qty06, s.qty07, s.qty08,
  s.qty09, s.qty10, s.qty11, s.qty12, s.qty13, s.qty14, s.qty15, s.qty16,
  bc.qty_c01, bc.qty_c02, bc.qty_c03, bc.qty_c04,
  bc.qty_c05, bc.qty_c06, bc.qty_c07, bc.qty_c08,
  bc.qty_c09, bc.qty_c10, bc.qty_c11, bc.qty_c12,
  bc.qty_c13, bc.qty_c14, bc.qty_c15, bc.qty_c16
FROM sal_order2 s WITH (NOLOCK)
JOIN sal_order1 s1 WITH (NOLOCK) ON s1.sheet_no = s.sheet_no
JOIN bas_goods g WITH (NOLOCK) ON g.goods_no = s.goods_no
LEFT JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = s1.cust_no1
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

-- Phân loại HADDAD / NON-HADDAD
SET @is_haddad = CASE
  WHEN EXISTS (
    SELECT 1 FROM #so
    WHERE cust_no IN ('10015','10110') OR cust_name LIKE '%HADDAD%'
  ) THEN 1 ELSE 0 END;

SET @len = CASE WHEN @is_haddad = 1 THEN 8 ELSE 60 END;
DELETE FROM #so WHERE LEFT(bar_no, @len) <> LEFT(@style, @len);

-- Chọn season
SET @s = @season;
IF @s IS NULL
  SELECT TOP 1 @s = season FROM #so ORDER BY sheet_date DESC, so_no DESC;
SET @s = ISNULL(@s, '');
DELETE FROM #so WHERE ISNULL(season, '') <> @s;

SELECT TOP 1 @cust_name = cust_name FROM #so;

-- Map size group
SELECT * INTO #sg FROM size_grp_gi WHERE cust_name = @cust_name;

IF @is_haddad = 1
  DELETE FROM #sg WHERE size_grp = 'HADDAD-12';

SELECT
  g.size_grp,
  UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz
INTO #sg_sz
FROM #sg g
CROSS APPLY (
  VALUES
    (size1),(size2),(size3),(size4),
    (size5),(size6),(size7),(size8),
    (size9),(size10),(size11),(size12),
    (size13),(size14),(size15),(size16)
) v(sz)
WHERE v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> '';

SELECT size_grp, COUNT(DISTINCT sz) AS n_def
INTO #grp_n FROM #sg_sz GROUP BY size_grp;

SELECT
  s.so_no, s.so_id, s.f_goods,
  UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz,
  v.q AS qty
INTO #so_sz
FROM #so s
CROSS APPLY (
  VALUES
    (q01,c01),(q02,c02),(q03,c03),(q04,c04),
    (q05,c05),(q06,c06),(q07,c07),(q08,c08),
    (q09,c09),(q10,c10),(q11,c11),(q12,c12),
    (q13,c13),(q14,c14),(q15,c15),(q16,c16)
) v(q, sz)
WHERE v.q > 0
  AND v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> '';

SELECT so_no, so_id, f_goods, COUNT(DISTINCT sz) AS n_sz
INTO #line_n FROM #so_sz GROUP BY so_no, so_id, f_goods;

;WITH cover AS (
  SELECT
    z.so_no, z.so_id, z.f_goods, g.size_grp,
    COUNT(DISTINCT z.sz) AS n_matched,
    gn.n_def
  FROM #so_sz z
  JOIN #sg_sz g ON g.sz = z.sz
  JOIN #grp_n gn ON gn.size_grp = g.size_grp
  GROUP BY z.so_no, z.so_id, z.f_goods, g.size_grp, gn.n_def
),
best AS (
  SELECT
    c.so_no, c.so_id, c.f_goods, c.size_grp, c.n_matched,
    ROW_NUMBER() OVER (
      PARTITION BY c.so_no, c.so_id, c.f_goods
      ORDER BY
        CASE WHEN c.n_matched = ln.n_sz THEN 0 ELSE 1 END,
        c.n_matched DESC,
        c.n_def,
        c.size_grp
    ) AS rn
  FROM cover c
  JOIN #line_n ln
    ON ln.so_no = c.so_no
    AND ln.so_id = c.so_id
    AND ln.f_goods = c.f_goods
)
SELECT b.so_no, b.so_id, b.f_goods, b.size_grp
INTO #line_grp
FROM best b
JOIN #line_n ln
  ON ln.so_no = b.so_no
  AND ln.so_id = b.so_id
  AND ln.f_goods = b.f_goods
WHERE b.rn = 1
  AND b.n_matched = ln.n_sz;

SELECT
  z.so_no, z.so_id, z.f_goods,
  lg.size_grp,
  SUM(z.qty) AS qty
INTO #so_sg0
FROM #so_sz z
JOIN #line_grp lg
  ON lg.so_no = z.so_no
  AND lg.so_id = z.so_id
  AND lg.f_goods = z.f_goods
JOIN #sg_sz gs
  ON gs.size_grp = lg.size_grp
  AND gs.sz = z.sz
GROUP BY z.so_no, z.so_id, z.f_goods, lg.size_grp

UNION ALL

SELECT
  s.so_no, s.so_id, s.f_goods,
  'COMMON-999', s.sheet_qty
FROM #so s
WHERE NOT EXISTS (
  SELECT 1 FROM #so_sz z
  WHERE z.so_no = s.so_no AND z.so_id = s.so_id
);

INSERT INTO #so_sg0 (so_no, so_id, f_goods, size_grp, qty)
SELECT
  z.so_no, z.so_id, z.f_goods,
  'COMMON-999',
  SUM(z.qty)
FROM #so_sz z
WHERE NOT EXISTS (
  SELECT 1 FROM #line_grp lg
  WHERE lg.so_no = z.so_no
    AND lg.so_id = z.so_id
    AND lg.f_goods = z.f_goods
)
GROUP BY z.so_no, z.so_id, z.f_goods;

SELECT
  so_no, so_id, f_goods, size_grp,
  SUM(qty) AS qty
INTO #so_sg
FROM #so_sg0
GROUP BY so_no, so_id, f_goods, size_grp;

SET @has_size = CASE
  WHEN EXISTS (
    SELECT 1 FROM #so_sg WHERE size_grp <> 'COMMON-999'
  ) THEN 1 ELSE 0 END;

IF @has_size = 0
  UPDATE #so_sg SET size_grp = 'COMMON-999';

-- Chọn duy nhất size group
SET @g = NULL;

IF @size_grp IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM #so_sg WHERE size_grp = @size_grp)
    SET @g = @size_grp;
  -- Nếu size group UI đang xem không có trong SO: để trống, không tự lấy nhóm khác.
END
ELSE
BEGIN
  IF @has_size = 0
    SET @g = 'COMMON-999';
  ELSE
    SELECT TOP 1 @g = size_grp
    FROM #so_sg
    WHERE size_grp <> 'COMMON-999'
    ORDER BY
      TRY_CAST(SUBSTRING(size_grp, CHARINDEX('-', size_grp) + 1, 10) AS int) ASC,
      size_grp ASC;
END;

-- Lấy MO
CREATE TABLE #mo (
  mo_no varchar(20),
  so_no varchar(20),
  so_id int,
  mo_qty numeric(18,8)
);

INSERT INTO #mo
SELECT
  m2.sheet_no,
  m2.ord_no,
  m2.ord_id,
  SUM(m2.sheet_qty)
FROM sfc_mo2 m2 WITH (NOLOCK)
WHERE m2.sheet_sta = '1'
  AND m2.sheet_no IN (
    SELECT m2b.sheet_no
    FROM sfc_mo2 m2b WITH (NOLOCK)
    JOIN sfc_mo1 m1 WITH (NOLOCK) ON m1.sheet_no = m2b.sheet_no
    JOIN sal_order2 s WITH (NOLOCK)
      ON s.sheet_no = m2b.ord_no
      AND s.sheet_id = m2b.ord_id
    JOIN sal_order1 s1 WITH (NOLOCK) ON s1.sheet_no = s.sheet_no
    JOIN bas_goods g WITH (NOLOCK) ON g.goods_no = s.goods_no
    WHERE m1.sheet_sta = '1'
      AND m2b.sheet_sta = '1'
      AND m1.sheet_type IN ('MOGI', 'MOGIB')
      AND REPLACE(g.bar_no, ' ', '') LIKE LEFT(@style, @len) + '%'
      AND s1.sheet_type IN ('SOGI', 'SOCGI')
      AND LTRIM(RTRIM(ISNULL(g.goods_model, ''))) = @s
  )
GROUP BY m2.sheet_no, m2.ord_no, m2.ord_id;

-- Materialize danh sách MO duy nhất
SELECT DISTINCT mo_no INTO #mo_key FROM #mo;
CREATE UNIQUE CLUSTERED INDEX IX_mo_key ON #mo_key(mo_no);

SELECT
  m.mo_no,
  SUM(m.mo_qty) AS total_mo_qty,
  SUM(CASE WHEN s.so_no IS NOT NULL THEN m.mo_qty ELSE 0 END) AS style_mo_qty,
  SUM(CASE WHEN s.so_no IS NOT NULL THEN m.mo_qty ELSE 0 END)
    / NULLIF(SUM(m.mo_qty), 0) AS share
INTO #mo_tot
FROM #mo m
LEFT JOIN (SELECT DISTINCT so_no, so_id FROM #so) s
  ON s.so_no = m.so_no
  AND s.so_id = m.so_id
GROUP BY m.mo_no;

CREATE TABLE #iss (
  iid int IDENTITY,
  mo_no varchar(20),
  goods_no varchar(30),
  made_lot varchar(50),
  qty numeric(18,8),
  sheet_no varchar(30),
  sheet_type varchar(20),
  add_flag int,
  unit_rate numeric(18,8),
  q01 numeric(18,8), q02 numeric(18,8), q03 numeric(18,8), q04 numeric(18,8),
  q05 numeric(18,8), q06 numeric(18,8), q07 numeric(18,8), q08 numeric(18,8),
  q09 numeric(18,8), q10 numeric(18,8), q11 numeric(18,8), q12 numeric(18,8),
  q13 numeric(18,8), q14 numeric(18,8), q15 numeric(18,8), q16 numeric(18,8),
  c01 varchar(50), c02 varchar(50), c03 varchar(50), c04 varchar(50),
  c05 varchar(50), c06 varchar(50), c07 varchar(50), c08 varchar(50),
  c09 varchar(50), c10 varchar(50), c11 varchar(50), c12 varchar(50),
  c13 varchar(50), c14 varchar(50), c15 varchar(50), c16 varchar(50)
);

-- Tối ưu INSERT #iss
INSERT INTO #iss (
  mo_no, goods_no, made_lot, qty,
  sheet_no, sheet_type, add_flag, unit_rate,
  q01,q02,q03,q04,q05,q06,q07,q08,
  q09,q10,q11,q12,q13,q14,q15,q16
)
SELECT
  o2.mo_no,
  o2.goods_no,
  ISNULL(o2.made_lot, ''),
  o2.add_flag * o2.sheet_qty * ISNULL(o2.unit_rate, 1),
  o1.sheet_no,
  o1.sheet_type,
  o2.add_flag,
  ISNULL(o2.unit_rate, 1),
  o2.add_flag*o2.qty01,
  o2.add_flag*o2.qty02,
  o2.add_flag*o2.qty03,
  o2.add_flag*o2.qty04,
  o2.add_flag*o2.qty05,
  o2.add_flag*o2.qty06,
  o2.add_flag*o2.qty07,
  o2.add_flag*o2.qty08,
  o2.add_flag*o2.qty09,
  o2.add_flag*o2.qty10,
  o2.add_flag*o2.qty11,
  o2.add_flag*o2.qty12,
  o2.add_flag*o2.qty13,
  o2.add_flag*o2.qty14,
  o2.add_flag*o2.qty15,
  o2.add_flag*o2.qty16
FROM #mo_key mk
JOIN dbo.scm_out2 o2 WITH (INDEX(IX_scm_out2_mo_costing))
  ON o2.mo_no = mk.mo_no
  AND o2.sheet_sta = '1'
JOIN dbo.scm_out1 o1 WITH (NOLOCK)
  ON o1.sheet_no = o2.sheet_no
  AND o1.sheet_sta = '1'
WHERE LEFT(o2.goods_no, 1) NOT IN ('S', 'J', 'F')
  AND LEFT(o1.sheet_no, 1) = 'W'
  AND CHARINDEX('-CK', o1.sheet_no) = 0;

UPDATE z SET
  z.c01=s.c01,z.c02=s.c02,z.c03=s.c03,z.c04=s.c04,
  z.c05=s.c05,z.c06=s.c06,z.c07=s.c07,z.c08=s.c08,
  z.c09=s.c09,z.c10=s.c10,z.c11=s.c11,z.c12=s.c12,
  z.c13=s.c13,z.c14=s.c14,z.c15=s.c15,z.c16=s.c16
FROM #iss z
CROSS APPLY (
  SELECT TOP 1
    x.c01,x.c02,x.c03,x.c04,x.c05,x.c06,x.c07,x.c08,
    x.c09,x.c10,x.c11,x.c12,x.c13,x.c14,x.c15,x.c16
  FROM #mo mo
  JOIN #so x
    ON x.so_no = mo.so_no
    AND x.so_id = mo.so_id
  WHERE mo.mo_no = z.mo_no
  ORDER BY x.so_no, x.so_id
) s;

CREATE TABLE #price (
  goods_no varchar(30),
  made_lot varchar(50),
  unit_usd numeric(18,8)
);

INSERT INTO #price
SELECT
  p2.goods_no,
  ISNULL(p2.made_lot, ''),
  SUM(x.usd) / NULLIF(SUM(
    CASE WHEN x.usd IS NOT NULL
      THEN p2.sheet_qty * ISNULL(p2.unit_rate, 1)
    END
  ), 0)
FROM pur_in2 p2 WITH (NOLOCK)
JOIN pur_in1 p1 WITH (NOLOCK) ON p1.sheet_no = p2.sheet_no
LEFT JOIN bas_cur_acc u WITH (NOLOCK)
  ON u.cur_code = 'USD'
  AND u.acc_period = p1.acc_period
LEFT JOIN bas_cur_acc c WITH (NOLOCK)
  ON c.cur_code = p2.cur_no
  AND c.acc_period = p1.acc_period
CROSS APPLY (
  SELECT CASE p2.cur_no
    WHEN 'USD' THEN p2.sheet_qty * p2.sheet_pri * p2.pri_dis
    WHEN 'VND' THEN p2.sheet_qty * p2.sheet_pri * p2.pri_dis / u.cur_rate
    ELSE p2.sheet_qty * p2.sheet_pri * p2.pri_dis / (u.cur_rate / c.cur_rate)
  END AS usd
) x
WHERE p1.sheet_sta = '1'
  AND p2.sheet_sta = '1'
  AND p1.sheet_type IN ('PIGI', 'PTGI', 'PTGIA')
  AND p2.sheet_qty <> 0
  AND p2.goods_no IN (SELECT DISTINCT goods_no FROM #iss)
GROUP BY p2.goods_no, ISNULL(p2.made_lot, '');

SELECT
  sg.parent_no AS prod_no,
  sg.child_no,
  sg.size_grp,
  AVG(sg.qty) AS usage_g
INTO #bom
FROM v_bom_stru2_sc_gi sg WITH (NOLOCK)
JOIN bom_stru1 b1 WITH (NOLOCK) ON b1.sheet_no = sg.sheet_no
WHERE sg.size_grp NOT LIKE 'COMMON-999'
  AND b1.sheet_sta = '1'
  AND sg.parent_no IN (SELECT DISTINCT f_goods FROM #so)
GROUP BY sg.parent_no, sg.child_no, sg.size_grp;

;WITH l AS (
  SELECT
    i.*,
    CASE
      WHEN LEFT(i.goods_no, 2) IN ('M1','M2','M3') THEN LEFT(i.goods_no, 2)
      ELSE 'B'
    END AS mat_cat,
    i.qty * ISNULL(p.unit_usd, 0) AS usd,
    CASE
      WHEN ABS(ISNULL(q01,0))+ABS(ISNULL(q02,0))
        +ABS(ISNULL(q03,0))+ABS(ISNULL(q04,0))
        +ABS(ISNULL(q05,0))+ABS(ISNULL(q06,0))
        +ABS(ISNULL(q07,0))+ABS(ISNULL(q08,0))
        +ABS(ISNULL(q09,0))+ABS(ISNULL(q10,0))
        +ABS(ISNULL(q11,0))+ABS(ISNULL(q12,0))
        +ABS(ISNULL(q13,0))+ABS(ISNULL(q14,0))
        +ABS(ISNULL(q15,0))+ABS(ISNULL(q16,0)) > 0
      THEN 1 ELSE 0
    END AS has_sz
  FROM #iss i
  LEFT JOIN #price p
    ON p.goods_no = i.goods_no
    AND p.made_lot = i.made_lot
)
SELECT * INTO #isz FROM l;

CREATE TABLE #alloc (
  iid int,
  mo_no varchar(20),
  mat_cat varchar(2),
  size_grp varchar(100),
  usd_g numeric(28,8),
  qty_g numeric(28,8)
);

SELECT
  mo.mo_no,
  gs.sz,
  MIN(lg.size_grp) AS size_grp
INTO #mo_sz
FROM #mo mo
JOIN #line_grp lg
  ON lg.so_no = mo.so_no
  AND lg.so_id = mo.so_id
JOIN #sg_sz gs
  ON gs.size_grp = lg.size_grp
GROUP BY mo.mo_no, gs.sz;

IF @has_size = 0
BEGIN
  INSERT INTO #alloc
  SELECT iid, mo_no, mat_cat, 'COMMON-999', usd, qty
  FROM #isz;
END
ELSE
BEGIN
  INSERT INTO #alloc
  SELECT
    z.iid,
    z.mo_no,
    z.mat_cat,
    ISNULL(ms.size_grp, 'COMMON-999'),
    z.usd * v.q / NULLIF(SUM(v.q) OVER (PARTITION BY z.iid), 0),
    z.qty * v.q / NULLIF(SUM(v.q) OVER (PARTITION BY z.iid), 0)
  FROM #isz z
  CROSS APPLY (
    VALUES
      (q01,c01),(q02,c02),(q03,c03),(q04,c04),
      (q05,c05),(q06,c06),(q07,c07),(q08,c08),
      (q09,c09),(q10,c10),(q11,c11),(q12,c12),
      (q13,c13),(q14,c14),(q15,c15),(q16,c16)
  ) v(q, sz)
  LEFT JOIN #mo_sz ms
    ON ms.mo_no = z.mo_no
    AND ms.sz = UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', ''))
  WHERE z.has_sz = 1
    AND v.q <> 0
    AND v.sz IS NOT NULL
    AND LTRIM(RTRIM(v.sz)) <> '';

  ;WITH w0 AS (
    SELECT
      z.iid, z.mo_no, z.mat_cat, z.usd, z.qty,
      g.size_grp,
      SUM(g.qty) AS q_g,
      MAX(b.usage_g) AS usage_g
    FROM #isz z
    JOIN #mo mo ON mo.mo_no = z.mo_no
    JOIN #so_sg g
      ON g.so_no = mo.so_no
      AND g.so_id = mo.so_id
    LEFT JOIN #bom b
      ON b.prod_no = g.f_goods
      AND b.child_no = z.goods_no
      AND b.size_grp = g.size_grp
    WHERE z.has_sz = 0
    GROUP BY z.iid, z.mo_no, z.mat_cat, z.usd, z.qty, g.size_grp
  ),
  w1 AS (
    SELECT *,
      COUNT(*) OVER (PARTITION BY iid) AS n_all,
      COUNT(CASE WHEN usage_g > 0 THEN 1 END) OVER (PARTITION BY iid) AS n_ok
    FROM w0
  ),
  w2 AS (
    SELECT *,
      CASE WHEN n_ok = n_all THEN q_g * usage_g ELSE q_g END AS wt
    FROM w1
  )
  INSERT INTO #alloc
  SELECT
    iid,
    mo_no,
    mat_cat,
    size_grp,
    usd * wt / NULLIF(SUM(wt) OVER (PARTITION BY iid), 0),
    qty * wt / NULLIF(SUM(wt) OVER (PARTITION BY iid), 0)
  FROM w2;
END;

SELECT
  a.size_grp,
  a.mat_cat,
  SUM(a.usd_g * t.share) AS usd,
  SUM(a.qty_g * t.share) AS qty_phat
INTO #r
FROM #alloc a
JOIN #mo_tot t ON t.mo_no = a.mo_no
GROUP BY a.size_grp, a.mat_cat;

;WITH q AS (
  SELECT size_grp, SUM(qty) AS qty_g
  FROM #so_sg
  GROUP BY size_grp

  UNION ALL

  SELECT DISTINCT size_grp, CAST(NULL AS numeric(28,8))
  FROM #r
  WHERE size_grp NOT IN (SELECT size_grp FROM #so_sg)
)
SELECT
  'PO3' AS po_type,
  @style AS cust_style,
  @s AS season,
  @g AS size_grp,
  CASE WHEN @has_size = 1 THEN N'có size' ELSE N'không size' END AS san_xuat,
  q.qty_g,
  SUM(CASE WHEN r.mat_cat = 'M1' THEN r.usd ELSE 0 END) / NULLIF(q.qty_g, 0) AS m1,
  SUM(CASE WHEN r.mat_cat = 'M2' THEN r.usd ELSE 0 END) / NULLIF(q.qty_g, 0) AS m2,
  SUM(CASE WHEN r.mat_cat = 'M3' THEN r.usd ELSE 0 END) / NULLIF(q.qty_g, 0) AS m3,
  SUM(CASE WHEN r.mat_cat = 'B' THEN r.usd ELSE 0 END) / NULLIF(q.qty_g, 0) AS opa,
  SUM(r.usd) / NULLIF(q.qty_g, 0) AS m_ttl
FROM q
LEFT JOIN #r r ON r.size_grp = q.size_grp
WHERE q.size_grp = @g
GROUP BY q.size_grp, q.qty_g;

DROP TABLE IF EXISTS
  #so, #sg, #sg_sz, #grp_n, #so_sz, #line_n, #line_grp,
  #so_sg0, #so_sg, #mo, #mo_key, #mo_tot, #mo_sz,
  #iss, #isz, #price, #bom, #alloc, #r;
`;
