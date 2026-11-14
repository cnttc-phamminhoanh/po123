/**
 * PO3 FOB unit price theo SQL cũ.
 *
 * Là đơn giá bình quân từ các dòng SO của style/season/size group đang xem.
 * Chỉ đọc dữ liệu trên DB hiện tại (RDS), không dùng pool OLD_DB_*.
 *
 * Tham số: p_style, p_season, p_size_grp.
 * Kết quả: avg_so_unit_price, total_so_qty, so_count.
 */
export const SQL_PO3_PRICE = `
SET NOCOUNT ON;

DECLARE @style    varchar(60)  = @p_style;
DECLARE @season   varchar(50)  = @p_season;
DECLARE @size_grp varchar(100) = @p_size_grp;

SET @style    = REPLACE(LTRIM(RTRIM(@style)), ' ', '');
SET @season   = NULLIF(LTRIM(RTRIM(@season)), '');
SET @size_grp = NULLIF(LTRIM(RTRIM(@size_grp)), '');

DECLARE
  @is_haddad bit,
  @len       int,
  @cust_name nvarchar(255);

DROP TABLE IF EXISTS
  #so, #sg_sz, #grp_n, #so_sz, #line_n,
  #line_grp, #so_sg, #result;

-- 1. Lấy các dòng SO của style
SELECT
  s.sheet_no AS so_no,
  s.sheet_id AS so_id,
  s.goods_no AS f_goods,
  LTRIM(RTRIM(ISNULL(g.goods_model, ''))) AS season,
  s1.cust_no1 AS cust_no,
  c.cust_name1 AS cust_name,
  REPLACE(LTRIM(RTRIM(g.bar_no)), ' ', '') AS bar_no,
  s.sheet_qty,
  s.sheet_pri,
  s.pri_dis,
  s1.sheet_date,
  s.qty01, s.qty02, s.qty03, s.qty04,
  s.qty05, s.qty06, s.qty07, s.qty08,
  s.qty09, s.qty10, s.qty11, s.qty12,
  s.qty13, s.qty14, s.qty15, s.qty16,
  bc.qty_c01, bc.qty_c02, bc.qty_c03, bc.qty_c04,
  bc.qty_c05, bc.qty_c06, bc.qty_c07, bc.qty_c08,
  bc.qty_c09, bc.qty_c10, bc.qty_c11, bc.qty_c12,
  bc.qty_c13, bc.qty_c14, bc.qty_c15, bc.qty_c16
INTO #so
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
WHERE REPLACE(LTRIM(RTRIM(g.bar_no)), ' ', '') LIKE LEFT(@style, 8) + '%'
  AND s1.sheet_type IN ('SOGI', 'SOCGI')
  AND s1.sheet_sta = '1'
  AND s.sheet_sta = '1'
  AND (s.close_type IS NULL OR LEFT(s.close_type, 1) <> '1')
  AND LEFT(s.goods_no, 1) = 'F';

-- 2. Nhận diện HADDAD và lọc style
SET @is_haddad = CASE
  WHEN EXISTS (
    SELECT 1
    FROM #so
    WHERE cust_no IN ('10015', '10110')
       OR cust_name LIKE '%HADDAD%'
  ) THEN 1 ELSE 0 END;

SET @len = CASE WHEN @is_haddad = 1 THEN 8 ELSE 60 END;

DELETE FROM #so
WHERE LEFT(bar_no, @len) <> LEFT(@style, @len);

IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
  RAISERROR(N'Không có SO phù hợp style theo điều kiện PO3 FOB unit price.', 16, 1);
  RETURN;
END;

-- 3. Chọn season
IF @season IS NULL
BEGIN
  SELECT TOP 1 @season = season
  FROM #so
  ORDER BY sheet_date DESC, so_no DESC;
END;

DELETE FROM #so
WHERE ISNULL(season, '') <> ISNULL(@season, '');

IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
  RAISERROR(N'Không có SO phù hợp season.', 16, 1);
  RETURN;
END;

SELECT TOP 1 @cust_name = cust_name
FROM #so
ORDER BY sheet_date DESC, so_no DESC;

-- 4. Size group
SELECT
  UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz,
  g.size_grp
INTO #sg_sz
FROM size_grp_gi g WITH (NOLOCK)
CROSS APPLY (VALUES
  (size1), (size2), (size3), (size4),
  (size5), (size6), (size7), (size8),
  (size9), (size10), (size11), (size12),
  (size13), (size14), (size15), (size16)
) v(sz)
WHERE g.cust_name = @cust_name
  AND v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> ''
  AND (@is_haddad = 0 OR g.size_grp <> 'HADDAD-12');

SELECT
  size_grp,
  COUNT(DISTINCT sz) AS n_def
INTO #grp_n
FROM #sg_sz
GROUP BY size_grp;

-- 5. Tách size và quantity từng dòng SO
SELECT
  s.so_no,
  s.so_id,
  s.f_goods,
  UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz,
  v.qty
INTO #so_sz
FROM #so s
CROSS APPLY (VALUES
  (s.qty01, s.qty_c01),
  (s.qty02, s.qty_c02),
  (s.qty03, s.qty_c03),
  (s.qty04, s.qty_c04),
  (s.qty05, s.qty_c05),
  (s.qty06, s.qty_c06),
  (s.qty07, s.qty_c07),
  (s.qty08, s.qty_c08),
  (s.qty09, s.qty_c09),
  (s.qty10, s.qty_c10),
  (s.qty11, s.qty_c11),
  (s.qty12, s.qty_c12),
  (s.qty13, s.qty_c13),
  (s.qty14, s.qty_c14),
  (s.qty15, s.qty_c15),
  (s.qty16, s.qty_c16)
) v(qty, sz)
WHERE v.qty > 0
  AND v.sz IS NOT NULL
  AND LTRIM(RTRIM(v.sz)) <> '';

SELECT
  so_no,
  so_id,
  f_goods,
  COUNT(DISTINCT sz) AS n_sz
INTO #line_n
FROM #so_sz
GROUP BY so_no, so_id, f_goods;

-- 6. Tìm size group phủ đủ size của từng dòng SO
;WITH cover AS (
  SELECT
    z.so_no,
    z.so_id,
    z.f_goods,
    g.size_grp,
    COUNT(DISTINCT z.sz) AS n_matched,
    gn.n_def
  FROM #so_sz z
  JOIN #sg_sz g
    ON g.sz = z.sz
  JOIN #grp_n gn
    ON gn.size_grp = g.size_grp
  GROUP BY z.so_no, z.so_id, z.f_goods, g.size_grp, gn.n_def
),
best AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      PARTITION BY c.so_no, c.so_id, c.f_goods
      ORDER BY
        CASE WHEN c.n_matched = ln.n_sz THEN 0 ELSE 1 END,
        c.n_matched DESC,
        c.n_def ASC,
        c.size_grp
    ) AS rn
  FROM cover c
  JOIN #line_n ln
    ON ln.so_no = c.so_no
   AND ln.so_id = c.so_id
   AND ln.f_goods = c.f_goods
)
SELECT
  b.so_no,
  b.so_id,
  b.f_goods,
  b.size_grp
INTO #line_grp
FROM best b
JOIN #line_n ln
  ON ln.so_no = b.so_no
 AND ln.so_id = b.so_id
 AND ln.f_goods = b.f_goods
WHERE b.rn = 1
  AND b.n_matched = ln.n_sz;

-- 7. Tổng quantity theo size group
SELECT
  z.so_no,
  z.so_id,
  z.f_goods,
  lg.size_grp,
  SUM(z.qty) AS qty
INTO #so_sg
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
  s.so_no,
  s.so_id,
  s.f_goods,
  'COMMON-999',
  s.sheet_qty
FROM #so s
WHERE NOT EXISTS (
  SELECT 1
  FROM #so_sz z
  WHERE z.so_no = s.so_no
    AND z.so_id = s.so_id
    AND z.f_goods = s.f_goods
);

INSERT INTO #so_sg (so_no, so_id, f_goods, size_grp, qty)
SELECT
  z.so_no,
  z.so_id,
  z.f_goods,
  'COMMON-999',
  SUM(z.qty)
FROM #so_sz z
WHERE NOT EXISTS (
  SELECT 1
  FROM #line_grp lg
  WHERE lg.so_no = z.so_no
    AND lg.so_id = z.so_id
    AND lg.f_goods = z.f_goods
)
GROUP BY z.so_no, z.so_id, z.f_goods;

-- 8. Tính PO3 Avg SO Unit Price
SELECT
  s.bar_no AS cust_style,
  s.season,
  sg.size_grp,
  SUM(
    CAST(sg.qty AS decimal(18,8))
    * CAST(ISNULL(s.sheet_pri, 0) AS decimal(18,8))
    * CAST(ISNULL(s.pri_dis, 0) AS decimal(18,8))
  )
  / NULLIF(SUM(CAST(sg.qty AS decimal(18,8))), 0)
    AS avg_so_unit_price,
  SUM(sg.qty) AS total_so_qty,
  COUNT(DISTINCT s.so_no) AS so_count
INTO #result
FROM #so s
JOIN #so_sg sg
  ON sg.so_no = s.so_no
 AND sg.so_id = s.so_id
 AND sg.f_goods = s.f_goods
GROUP BY s.bar_no, s.season, sg.size_grp;

-- 9. Chọn size group: nếu truyền thì lọc đúng, nếu NULL thì chọn nhóm nhỏ nhất.
IF @size_grp IS NULL
BEGIN
  SELECT TOP 1 @size_grp = size_grp
  FROM #result
  WHERE size_grp <> 'COMMON-999'
  ORDER BY
    TRY_CAST(SUBSTRING(size_grp, CHARINDEX('-', size_grp) + 1, 10) AS int),
    size_grp;

  IF @size_grp IS NULL
    SET @size_grp = 'COMMON-999';
END;

SELECT
  'PO3' AS po_type,
  cust_style,
  season,
  size_grp,
  total_so_qty,
  so_count,
  avg_so_unit_price AS [PO3 Avg SO Unit Price]
FROM #result
WHERE size_grp = @size_grp
ORDER BY cust_style, season, size_grp;

DROP TABLE IF EXISTS
  #so, #sg_sz, #grp_n, #so_sz, #line_n,
  #line_grp, #so_sg, #result;
`;
