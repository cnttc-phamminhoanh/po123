/**
 * Toàn bộ câu SQL của API nằm ở đây để dễ rà soát và tối ưu.
 * Bảng dùng: sal_po_costing1..4, bas_cust, smp_goods, bas_goods_type,
 * bas_base_code, bas_cur, sal_order1/2, sal_out1/2, bas_goods.
 *
 * Quy ước lấy style: khách HADDAD so 8 ký tự đầu, khách khác so nguyên chuỗi.
 */
const STYLE_FILTER = `
    AND (
      (
        c.cust_name1 LIKE '%HADDAD%'
        AND LEFT(REPLACE(pn.def04, ' ', ''), 8) = LEFT(REPLACE(@style, ' ', ''), 8)
      )
      OR (
        c.cust_name1 NOT LIKE '%HADDAD%'
        AND REPLACE(pn.def04, ' ', '') = REPLACE(@style, ' ', '')
      )
    )`;

export const SQL_STYLE_LIST = `
SELECT
  CASE
    WHEN c.cust_name1 LIKE '%HADDAD%' THEN LEFT(REPLACE(pn.def04, ' ', ''), 8)
    ELSE REPLACE(pn.def04, ' ', '')
  END AS style_key,
  MAX(c.cust_name1) AS buyer,
  pn.season AS season,
  LTRIM(RTRIM(pn.terms)) AS terms,
  MAX(pn.check_date) AS last_check_date,
  MAX(ISNULL(sg.goods_name, '')) AS goods_name
FROM sal_po_costing1 pn WITH (NOLOCK)
INNER JOIN bas_cust c WITH (NOLOCK)
  ON c.cust_no = pn.cust_no
LEFT JOIN smp_goods sg WITH (NOLOCK)
  ON sg.goods_no = pn.goods_no
WHERE pn.sheet_sta = '1'
  AND pn.sheet_type = 'POCGGI'
  AND NULLIF(LTRIM(RTRIM(pn.def04)), '') IS NOT NULL
GROUP BY
  CASE
    WHEN c.cust_name1 LIKE '%HADDAD%' THEN LEFT(REPLACE(pn.def04, ' ', ''), 8)
    ELSE REPLACE(pn.def04, ' ', '')
  END,
  pn.season,
  LTRIM(RTRIM(pn.terms))
`;

export const SQL_STYLE_CONTEXT = `
SELECT
  pn.sheet_no,
  pn.season,
  LTRIM(RTRIM(pn.terms)) AS terms,
  pn.check_date,
  c.cust_name1 AS buyer,
  MAX(ISNULL(sg.goods_name, '')) AS goods_name
FROM sal_po_costing1 pn WITH (NOLOCK)
INNER JOIN bas_cust c WITH (NOLOCK)
  ON c.cust_no = pn.cust_no
LEFT JOIN smp_goods sg WITH (NOLOCK)
  ON sg.goods_no = pn.goods_no
WHERE pn.sheet_sta = '1'
  AND pn.sheet_type = 'POCGGI'
  ${STYLE_FILTER}
GROUP BY pn.sheet_no, pn.season, LTRIM(RTRIM(pn.terms)), pn.check_date, c.cust_name1
`;

/** Chi phí PO1: header + material + labor + expense của báo giá mới nhất. */
export const SQL_PO1_COST = `
;WITH po_header AS (
  SELECT
    pn.sheet_no,
    pn.season,
    LTRIM(RTRIM(pn.terms)) AS terms,
    TRY_CAST(pn.def06 AS NUMERIC(18, 8)) AS fob,
    pn.def05 AS factory,
    pn.ver_no,
    pn.rem,
    pn.check_date,
    pn.sheet_date,
    pn.goods_no,
    pn.brand,
    pn.min_ord_qty,
    pn.pack_desc,
    pn.pack_len,
    pn.pack_width,
    pn.pack_height,
    pn.pack_num,
    pn.def03,
    pn.def07,
    pn.def08,
    ISNULL(sg.goods_name, '') AS goods_name,
    ISNULL(t.goods_type_desc, '') AS goods_type_desc,
    ROW_NUMBER() OVER (ORDER BY pn.check_date DESC, pn.sheet_no DESC) AS rn
  FROM sal_po_costing1 pn WITH (NOLOCK)
  INNER JOIN bas_cust c WITH (NOLOCK)
    ON c.cust_no = pn.cust_no
  LEFT JOIN smp_goods sg WITH (NOLOCK)
    ON sg.goods_no = pn.goods_no
  LEFT JOIN bas_goods_type t WITH (NOLOCK)
    ON t.goods_type = sg.goods_type
  WHERE pn.sheet_sta = '1'
    AND pn.sheet_type = 'POCGGI'
    AND pn.season = @season
    AND LTRIM(RTRIM(pn.terms)) = @terms
    ${STYLE_FILTER}
),
material_raw AS (
  SELECT
    m.sheet_no,
    CASE
      WHEN b.base_name IS NULL AND m.goods_no IS NULL THEN 'xx'
      WHEN b.base_name IS NOT NULL THEN LOWER(LEFT(b.base_name, 2))
      ELSE LOWER(LEFT(m.goods_no, 2))
    END AS mat_type,
    m.sheet_amt
  FROM sal_po_costing3 m WITH (NOLOCK)
  LEFT JOIN bas_base_code b WITH (NOLOCK)
    ON b.base_code = m.mat_flag
    AND b.code_type = '338'
),
material AS (
  SELECT
    sheet_no,
    SUM(CASE WHEN mat_type = 'm1' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS m1,
    SUM(CASE WHEN mat_type = 'm2' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS m2,
    SUM(CASE WHEN mat_type = 'm3' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS m3,
    SUM(CASE WHEN mat_type = 'b' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS opa,
    SUM(CASE WHEN mat_type IN ('m1', 'm2', 'm3', 'b') THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS m_ttl
  FROM material_raw
  GROUP BY sheet_no
),
labor_raw AS (
  SELECT
    l.sheet_no,
    CASE
      WHEN l.pro_no IN ('CUT', '509', '501', '019') THEN 'CUT'
      WHEN l.pro_no IN ('PRI', '003', '511', '508') THEN 'PRI'
      WHEN l.pro_no IN ('EMB', '013', '607', '007', '507') THEN 'EMB'
      WHEN l.pro_no IN ('SEW', '502', '513') THEN 'SEW'
      WHEN l.pro_no IN ('FIN', '011', '005') THEN 'FIN'
      WHEN l.pro_no IN ('PAC', '506', '510') THEN 'PAC'
      WHEN l.pro_no = 'SOC' THEN 'SOC'
      ELSE 'ETC'
    END AS process,
    l.sheet_amt
  FROM sal_po_costing2 l WITH (NOLOCK)
),
labor AS (
  SELECT
    sheet_no,
    SUM(CASE WHEN process = 'CUT' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS cut,
    SUM(CASE WHEN process = 'SEW' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS sew,
    SUM(CASE WHEN process = 'FIN' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS fin,
    SUM(CASE WHEN process = 'PAC' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS pac,
    SUM(CASE WHEN process = 'PRI' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS pri,
    SUM(CASE WHEN process = 'EMB' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS emb,
    SUM(CASE WHEN process = 'SOC' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS soc,
    SUM(CASE WHEN process = 'ETC' THEN ISNULL(sheet_amt, 0) ELSE 0 END) / 1000.0 AS etc,
    SUM(ISNULL(sheet_amt, 0)) / 1000.0 AS l_ttl
  FROM labor_raw
  GROUP BY sheet_no
),
expense AS (
  SELECT
    e.sheet_no,
    SUM(ISNULL(e.sheet_amt, 0)) / 1000.0 AS exp
  FROM sal_po_costing4 e WITH (NOLOCK)
  GROUP BY e.sheet_no
),
fx AS (
  SELECT
    MAX(CASE WHEN cur_code = 'USD' THEN cur_rate END) AS usd_rate,
    MAX(CASE WHEN cur_code = 'RMB' THEN cur_rate END) AS rmb_rate,
    MAX(CASE WHEN cur_code = 'HKD' THEN cur_rate END) AS hkd_rate
  FROM bas_cur WITH (NOLOCK)
)
SELECT TOP 1
  h.sheet_no,
  h.factory,
  h.ver_no,
  h.rem,
  h.check_date,
  h.sheet_date,
  h.terms,
  h.fob,
  h.goods_no,
  h.goods_name,
  h.goods_type_desc,
  h.brand,
  h.min_ord_qty,
  h.pack_desc,
  h.pack_len,
  h.pack_width,
  h.pack_height,
  h.pack_num,
  h.def03,
  h.def07,
  h.def08,
  fx.usd_rate,
  fx.rmb_rate,
  fx.hkd_rate,
  ISNULL(m.m1, 0) AS m1,
  ISNULL(m.m2, 0) AS m2,
  ISNULL(m.m3, 0) AS m3,
  ISNULL(m.opa, 0) AS opa,
  ISNULL(m.m_ttl, 0) AS m_ttl,
  ISNULL(l.cut, 0) AS cut,
  ISNULL(l.sew, 0) AS sew,
  ISNULL(l.fin, 0) AS fin,
  ISNULL(l.pac, 0) AS pac,
  ISNULL(l.pri, 0) AS pri,
  ISNULL(l.emb, 0) AS emb,
  ISNULL(l.soc, 0) AS soc,
  ISNULL(l.etc, 0) AS etc,
  ISNULL(l.l_ttl, 0) AS l_ttl,
  ISNULL(e.exp, 0) AS exp
FROM po_header h
LEFT JOIN material m ON m.sheet_no = h.sheet_no
LEFT JOIN labor l ON l.sheet_no = h.sheet_no
LEFT JOIN expense e ON e.sheet_no = h.sheet_no
CROSS JOIN fx
WHERE h.rn = 1
`;

/** Số lượng đơn hàng, số đã xuất, ngày giao sớm nhất / muộn nhất theo style. */
export const SQL_STYLE_QTY = `
SELECT
  SUM(
    CASE
      WHEN s1.close_sw = '1' OR s.close_sw = '1' OR s.close_date IS NOT NULL THEN 0
      ELSE ISNULL(s.sheet_qty, 0)
    END
  ) AS units,
  SUM(ISNULL(ship.ship_qty, 0)) AS shipped,
  MIN(ISNULL(s.def25, s.del_date)) AS first_crd,
  MAX(ISNULL(s.def25, s.del_date)) AS last_crd
FROM sal_order2 s WITH (NOLOCK)
INNER JOIN sal_order1 s1 WITH (NOLOCK)
  ON s1.sheet_no = s.sheet_no
INNER JOIN bas_goods g WITH (NOLOCK)
  ON g.goods_no = s.goods_no
LEFT JOIN (
  SELECT
    o.ord_no,
    o.ord_id,
    SUM(o.sheet_qty * o.add_flag * o.unit_rate) AS ship_qty
  FROM sal_out2 o WITH (NOLOCK)
  INNER JOIN sal_out1 o1 WITH (NOLOCK)
    ON o1.sheet_no = o.sheet_no
  WHERE o1.sheet_sta = '1' AND o.sheet_sta = '1'
  GROUP BY o.ord_no, o.ord_id
) ship
  ON ship.ord_no = s.sheet_no
  AND ship.ord_id = s.sheet_id
WHERE s1.sheet_sta = '1'
  AND s.sheet_sta = '1'
  AND s1.cust_no1 <> '10003'
  AND (
    (
      EXISTS (
        SELECT 1
        FROM bas_cust bc WITH (NOLOCK)
        WHERE bc.cust_no = s1.cust_no1
          AND bc.cust_name1 LIKE '%HADDAD%'
      )
      AND LEFT(REPLACE(g.bar_no, ' ', ''), 8) = LEFT(REPLACE(@style, ' ', ''), 8)
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM bas_cust bc WITH (NOLOCK)
        WHERE bc.cust_no = s1.cust_no1
          AND bc.cust_name1 LIKE '%HADDAD%'
      )
      AND REPLACE(g.bar_no, ' ', '') = REPLACE(@style, ' ', '')
    )
  )
`;
