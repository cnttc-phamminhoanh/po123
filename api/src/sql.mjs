/**
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

export const SQL_LATEST_STYLE = `
SELECT TOP 1
  CASE
    WHEN c.cust_name1 LIKE '%HADDAD%' THEN LEFT(REPLACE(pn.def04, ' ', ''), 8)
    ELSE REPLACE(pn.def04, ' ', '')
  END AS code,
  pn.season AS season
FROM sal_po_costing1 pn WITH (NOLOCK)
INNER JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
WHERE pn.sheet_type = 'POCGGI' AND NULLIF(LTRIM(RTRIM(pn.def04)), '') IS NOT NULL
ORDER BY COALESCE(pn.create_date, pn.sheet_date) DESC, pn.sheet_no DESC
`;

export const SQL_DEBUG_COUNTS = `
SELECT
  (SELECT COUNT(*) FROM sal_po_costing1 WITH (NOLOCK)) AS rows_all,
  (SELECT COUNT(*) FROM sal_po_costing1 WITH (NOLOCK) WHERE sheet_sta = '1') AS rows_open,
  (SELECT COUNT(*) FROM sal_po_costing1 WITH (NOLOCK) WHERE sheet_type = 'POCGGI') AS rows_pocggi,
  (SELECT COUNT(*) FROM sal_po_costing1 WITH (NOLOCK)
    WHERE sheet_sta = '1' AND sheet_type = 'POCGGI') AS rows_both,
  (SELECT COUNT(DISTINCT sheet_no) FROM sal_po_costing1 WITH (NOLOCK)
    WHERE sheet_sta = '1' AND sheet_type = 'POCGGI') AS sheets_both
`;

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
INNER JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
LEFT JOIN smp_goods sg WITH (NOLOCK) ON sg.goods_no = pn.goods_no
WHERE pn.sheet_type = 'POCGGI' AND NULLIF(LTRIM(RTRIM(pn.def04)), '') IS NOT NULL
GROUP BY
  CASE
    WHEN c.cust_name1 LIKE '%HADDAD%' THEN LEFT(REPLACE(pn.def04, ' ', ''), 8)
    ELSE REPLACE(pn.def04, ' ', '')
  END,
  pn.season,
  LTRIM(RTRIM(pn.terms))
`;

export const SQL_STYLE_EXISTS = `
SELECT TOP 1 1 AS found
FROM sal_po_costing1 pn WITH (NOLOCK)
INNER JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
WHERE pn.sheet_type = 'POCGGI' ${STYLE_FILTER}
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
INNER JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
LEFT JOIN smp_goods sg WITH (NOLOCK) ON sg.goods_no = pn.goods_no
WHERE pn.sheet_type = 'POCGGI' ${STYLE_FILTER}
GROUP BY pn.sheet_no, pn.season, LTRIM(RTRIM(pn.terms)), pn.check_date, c.cust_name1
ORDER BY pn.sheet_no ASC
`;

/** Chi phí PO1: header + material + labor + expense của báo giá mới nhất. */
export const SQL_PO1_COST = `
;WITH po_header AS (
  SELECT
    pn.sheet_no, pn.season, LTRIM(RTRIM(pn.terms)) AS terms, TRY_CAST(pn.def06 AS NUMERIC(18, 8)) AS fob,
    pn.def05 AS factory, pn.ver_no, pn.rem, pn.check_date, pn.sheet_date, pn.goods_no, pn.brand, pn.min_ord_qty,
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
    ROW_NUMBER() OVER (ORDER BY COALESCE(pn.create_date, pn.sheet_date) DESC, pn.sheet_no DESC) AS rn
  FROM sal_po_costing1 pn WITH (NOLOCK)
  INNER JOIN bas_cust c WITH (NOLOCK) ON c.cust_no = pn.cust_no
  LEFT JOIN smp_goods sg WITH (NOLOCK) ON sg.goods_no = pn.goods_no
  LEFT JOIN bas_goods_type t WITH (NOLOCK) ON t.goods_type = sg.goods_type
  WHERE pn.sheet_type = 'POCGGI' AND pn.season = @season AND LTRIM(RTRIM(pn.terms)) = @terms ${STYLE_FILTER}
),
material_raw AS (
  SELECT
    m.sheet_no,
    CASE
      WHEN m.mat_flag = '101' THEN 'm1'
      WHEN m.mat_flag = '102' THEN 'm2'
      WHEN m.mat_flag = '103' THEN 'm3'
      WHEN b.base_name IS NOT NULL THEN LOWER(LEFT(b.base_name, 2))
      WHEN m.goods_no IS NOT NULL THEN LOWER(LEFT(m.goods_no, 2))
      ELSE 'xx'
    END AS mat_type,
    m.goods_no AS mat_no,
    m.mat_flag,
    m.goods_name AS mat_name,
    m.sheet_amt
  FROM sal_po_costing3 m WITH (NOLOCK)
  LEFT JOIN bas_base_code b WITH (NOLOCK) ON b.base_code = m.mat_flag AND b.code_type = '338'
),
material_detail AS (
  SELECT
    sheet_no,
    CASE mat_type
      WHEN 'm1' THEN 'fabric'
      WHEN 'm2' THEN 'trim'
      WHEN 'm3' THEN 'pack'
      WHEN 'b' THEN 'opa'
    END AS category,
    COALESCE(NULLIF(mat_no, ''), NULLIF(LTRIM(RTRIM(mat_flag)), '')) AS code,
    ISNULL(mat_name, '') AS name,
    SUM(ISNULL(sheet_amt, 0)) / 1000.0 AS amount
  FROM material_raw
  WHERE mat_type IN ('m1', 'm2', 'm3', 'b')
  GROUP BY sheet_no, mat_type, mat_no, mat_flag, mat_name
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
expense_name AS (
  SELECT base_code, MAX(base_name) AS base_name
  FROM bas_base_code WITH (NOLOCK)
  GROUP BY base_code
),
expense_type AS (
  SELECT
    e.sheet_no, e.fee_type, MAX(b.base_name) AS base_name,
    SUM(ISNULL(e.sheet_amt, 0)) / 1000.0 AS fee_usd
  FROM sal_po_costing4 e WITH (NOLOCK)
  LEFT JOIN expense_name b ON b.base_code = e.fee_type
  GROUP BY e.sheet_no, e.fee_type
),
expense_classified AS (
  SELECT
    sheet_no,
    fee_usd,
    CASE
      WHEN fee_type = '505'
        OR base_name LIKE N'%运费%'
        OR base_name LIKE N'%vận chuyển%'
        OR base_name LIKE N'%transport%'
        OR base_name LIKE N'%freight%'
        OR base_name LIKE N'%shipping%'
        THEN 'freight'
      WHEN fee_type = '503'
        OR fee_type LIKE 'CP052%'
        OR base_name LIKE N'%测试%'
        OR base_name LIKE N'%kiểm%'
        OR base_name LIKE N'%test%'
        OR base_name LIKE N'%QC%'
        THEN 'qc'
      ELSE 'other'
    END AS expense_group
  FROM expense_type
),
expense_split AS (
  SELECT
    sheet_no,
    SUM(CASE WHEN expense_group = 'qc' THEN fee_usd ELSE 0 END) AS qc_exp,
    SUM(CASE WHEN expense_group = 'freight' THEN fee_usd ELSE 0 END) AS freight_exp
  FROM expense_classified
  GROUP BY sheet_no
),
expense AS (
  SELECT sheet_no, SUM(fee_usd) AS exp
  FROM expense_type
  GROUP BY sheet_no
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
  ISNULL(e.exp, 0) AS exp,
  ISNULL(x.qc_exp, 0) AS qc_exp,
  ISNULL(x.freight_exp, 0) AS freight_exp,
  (
    SELECT
      d.category,
      d.code,
      COALESCE(NULLIF(d.name, ''), bg.goods_name, '') AS name,
      d.amount
    FROM material_detail d
    LEFT JOIN bas_goods bg WITH (NOLOCK) ON bg.goods_no = d.code
    WHERE d.sheet_no = h.sheet_no AND d.amount <> 0
    FOR JSON PATH
  ) AS material_details
FROM po_header h
LEFT JOIN material m ON m.sheet_no = h.sheet_no
LEFT JOIN labor l ON l.sheet_no = h.sheet_no
LEFT JOIN expense e ON e.sheet_no = h.sheet_no
LEFT JOIN expense_split x ON x.sheet_no = h.sheet_no
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
INNER JOIN sal_order1 s1 WITH (NOLOCK) ON s1.sheet_no = s.sheet_no
INNER JOIN bas_goods g WITH (NOLOCK) ON g.goods_no = s.goods_no
LEFT JOIN (
  SELECT
    o.ord_no,
    o.ord_id,
    SUM(o.sheet_qty * o.add_flag * o.unit_rate) AS ship_qty
  FROM sal_out2 o WITH (NOLOCK)
  INNER JOIN sal_out1 o1 WITH (NOLOCK) ON o1.sheet_no = o.sheet_no
  WHERE o1.sheet_sta = '1' AND o.sheet_sta = '1'
  GROUP BY o.ord_no, o.ord_id
) ship ON ship.ord_no = s.sheet_no AND ship.ord_id = s.sheet_id
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

/** Bảng tài khoản đăng nhập của ứng dụng (không phải tài khoản ERP). */
export const SQL_AUTH_SCHEMA = `
IF OBJECT_ID(N'dbo.po_app_user', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.po_app_user (
    id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_po_app_user PRIMARY KEY,
    username NVARCHAR(64) NOT NULL,
    emp_no NVARCHAR(20) NULL,
    emp_name NVARCHAR(100) NULL,
    password_hash NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) NOT NULL CONSTRAINT DF_po_app_user_role DEFAULT N'user',
    is_active BIT NOT NULL CONSTRAINT DF_po_app_user_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_po_app_user_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT UQ_po_app_user_username UNIQUE (username)
  );
END

IF COL_LENGTH(N'dbo.po_app_user', N'emp_no') IS NULL
  ALTER TABLE dbo.po_app_user ADD emp_no NVARCHAR(20) NULL;

IF COL_LENGTH(N'dbo.po_app_user', N'emp_name') IS NULL
  ALTER TABLE dbo.po_app_user ADD emp_name NVARCHAR(100) NULL;
`;

/** Tra cứu nhân viên theo mã. */
export const SQL_EMP_BY_NO = `
SELECT TOP 1
  LTRIM(RTRIM(emp_no)) AS emp_no,
  LTRIM(RTRIM(emp_name)) AS emp_name
FROM dbo.bas_emp WITH (NOLOCK)
WHERE LOWER(LTRIM(RTRIM(emp_no))) = LOWER(@emp_no)
`;

export const SQL_AUTH_USER_BY_NAME = `
SELECT TOP 1 id, username, emp_no, emp_name, password_hash, role, is_active, created_at
FROM dbo.po_app_user
WHERE LOWER(username) = LOWER(@username)
`;

export const SQL_AUTH_USER_BY_ID = `
SELECT TOP 1 id, username, emp_no, emp_name, password_hash, role, is_active, created_at
FROM dbo.po_app_user
WHERE id = @id
`;

export const SQL_AUTH_USER_LIST = `
SELECT id, username, emp_no, emp_name, role, is_active, created_at, updated_at
FROM dbo.po_app_user
ORDER BY is_active DESC, emp_name ASC, username ASC
`;

export const SQL_AUTH_USER_COUNT = `
SELECT COUNT(*) AS total
FROM dbo.po_app_user
`;

export const SQL_AUTH_USER_INSERT = `
INSERT INTO dbo.po_app_user (username, emp_no, emp_name, password_hash, role, is_active)
OUTPUT INSERTED.id, INSERTED.username, INSERTED.emp_no, INSERTED.emp_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at
VALUES (@username, @emp_no, @emp_name, @password_hash, @role, 1)
`;

export const SQL_AUTH_USER_SET_ROLE = `
UPDATE dbo.po_app_user
SET role = @role, updated_at = SYSUTCDATETIME()
OUTPUT INSERTED.id, INSERTED.username, INSERTED.emp_no, INSERTED.emp_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at, INSERTED.updated_at
WHERE id = @id
`;

export const SQL_AUTH_USER_SET_ACTIVE = `
UPDATE dbo.po_app_user
SET is_active = @is_active, updated_at = SYSUTCDATETIME()
OUTPUT INSERTED.id, INSERTED.username, INSERTED.emp_no, INSERTED.emp_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at, INSERTED.updated_at
WHERE id = @id
`;

export const SQL_AUTH_USER_SET_PASSWORD = `
UPDATE dbo.po_app_user
SET password_hash = @password_hash, updated_at = SYSUTCDATETIME()
OUTPUT INSERTED.id, INSERTED.username, INSERTED.emp_no, INSERTED.emp_name, INSERTED.role, INSERTED.is_active, INSERTED.created_at, INSERTED.updated_at
WHERE id = @id
`;

export const SQL_AUTH_ACTIVE_ADMIN_COUNT = `
SELECT COUNT(*) AS total
FROM dbo.po_app_user
WHERE role = N'admin' AND is_active = 1
`;

/** Lịch sử upload ảnh style: mỗi lần upload là một dòng. */
export const SQL_PHOTO_AUDIT_SCHEMA = `
IF OBJECT_ID(N'dbo.po_style_photo_audit', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.po_style_photo_audit (
    id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_po_style_photo_audit PRIMARY KEY,
    style_code NVARCHAR(60) NOT NULL,
    file_name NVARCHAR(255) NULL,
    uploaded_by NVARCHAR(64) NULL,
    uploaded_by_emp_no NVARCHAR(20) NULL,
    uploaded_by_name NVARCHAR(100) NULL,
    access_source NVARCHAR(16) NULL,
    access_host NVARCHAR(255) NULL,
    client_ip NVARCHAR(64) NULL,
    uploaded_at DATETIME2 NOT NULL CONSTRAINT DF_po_style_photo_audit_at DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_po_style_photo_audit_style
    ON dbo.po_style_photo_audit (style_code, uploaded_at DESC);
END
`;

/** Migration thêm 3 cột nguồn/IP; chạy bằng tài khoản admin (app user không có ALTER). */
export const SQL_PHOTO_AUDIT_ACCESS_MIGRATION = `
IF COL_LENGTH(N'dbo.po_style_photo_audit', N'access_source') IS NULL
  ALTER TABLE dbo.po_style_photo_audit ADD access_source NVARCHAR(16) NULL;

IF COL_LENGTH(N'dbo.po_style_photo_audit', N'access_host') IS NULL
  ALTER TABLE dbo.po_style_photo_audit ADD access_host NVARCHAR(255) NULL;

IF COL_LENGTH(N'dbo.po_style_photo_audit', N'client_ip') IS NULL
  ALTER TABLE dbo.po_style_photo_audit ADD client_ip NVARCHAR(64) NULL;
`;

export const SQL_PHOTO_AUDIT_COLUMNS = `
SELECT COUNT(1) AS n
FROM sys.columns
WHERE object_id = OBJECT_ID(N'dbo.po_style_photo_audit')
  AND name IN (N'access_source', N'access_host', N'client_ip')
`;

export const SQL_PHOTO_AUDIT_TABLE_EXISTS = `
SELECT CASE WHEN OBJECT_ID(N'dbo.po_style_photo_audit', N'U') IS NULL THEN 0 ELSE 1 END AS exists_flag
`;

export const SQL_PHOTO_AUDIT_INSERT = `
INSERT INTO dbo.po_style_photo_audit
  (style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name,
   access_source, access_host, client_ip, uploaded_at)
OUTPUT
  INSERTED.style_code, INSERTED.file_name, INSERTED.uploaded_by,
  INSERTED.uploaded_by_emp_no, INSERTED.uploaded_by_name,
  INSERTED.access_source, INSERTED.access_host, INSERTED.client_ip,
  INSERTED.uploaded_at
VALUES
  (@style_code, @file_name, @uploaded_by, @uploaded_by_emp_no, @uploaded_by_name,
   @access_source, @access_host, @client_ip, SYSUTCDATETIME());
`;

export const SQL_PHOTO_AUDIT_BY_STYLE = `
SELECT TOP 1
  style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name,
  access_source, access_host, client_ip, uploaded_at
FROM dbo.po_style_photo_audit
WHERE style_code = @style_code
ORDER BY uploaded_at DESC, id DESC
`;

export const SQL_PHOTO_AUDIT_SEARCH = `
SELECT
  id, style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name,
  access_source, access_host, client_ip, uploaded_at
FROM dbo.po_style_photo_audit
WHERE (@style_filter = N'' OR style_code LIKE N'%' + @style_filter + N'%')
  AND (
    @uploader_filter = N''
    OR uploaded_by LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_emp_no LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_name LIKE N'%' + @uploader_filter + N'%'
  )
  AND (@date_from IS NULL OR uploaded_at >= CAST(@date_from AS date))
  AND (@date_to IS NULL OR uploaded_at < DATEADD(day, 1, CAST(@date_to AS date)))
ORDER BY uploaded_at DESC, id DESC
OFFSET @row_offset ROWS FETCH NEXT @row_limit ROWS ONLY
`;

export const SQL_PHOTO_AUDIT_SEARCH_COUNT = `
SELECT COUNT(*) AS total
FROM dbo.po_style_photo_audit
WHERE (@style_filter = N'' OR style_code LIKE N'%' + @style_filter + N'%')
  AND (
    @uploader_filter = N''
    OR uploaded_by LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_emp_no LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_name LIKE N'%' + @uploader_filter + N'%'
  )
  AND (@date_from IS NULL OR uploaded_at >= CAST(@date_from AS date))
  AND (@date_to IS NULL OR uploaded_at < DATEADD(day, 1, CAST(@date_to AS date)))
`;

/** Fallback cho DB chưa chạy migration 3 cột nguồn/IP. */
export const SQL_PHOTO_AUDIT_LEGACY_INSERT = `
INSERT INTO dbo.po_style_photo_audit
  (style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name, uploaded_at)
OUTPUT
  INSERTED.style_code, INSERTED.file_name, INSERTED.uploaded_by,
  INSERTED.uploaded_by_emp_no, INSERTED.uploaded_by_name, INSERTED.uploaded_at
VALUES
  (@style_code, @file_name, @uploaded_by, @uploaded_by_emp_no, @uploaded_by_name,
   SYSUTCDATETIME());
`;

export const SQL_PHOTO_AUDIT_LEGACY_BY_STYLE = `
SELECT TOP 1
  style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name, uploaded_at
FROM dbo.po_style_photo_audit
WHERE style_code = @style_code
ORDER BY uploaded_at DESC, id DESC
`;

export const SQL_PHOTO_AUDIT_LEGACY_SEARCH = `
SELECT
  id, style_code, file_name, uploaded_by, uploaded_by_emp_no, uploaded_by_name, uploaded_at
FROM dbo.po_style_photo_audit
WHERE (@style_filter = N'' OR style_code LIKE N'%' + @style_filter + N'%')
  AND (
    @uploader_filter = N''
    OR uploaded_by LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_emp_no LIKE N'%' + @uploader_filter + N'%'
    OR uploaded_by_name LIKE N'%' + @uploader_filter + N'%'
  )
  AND (@date_from IS NULL OR uploaded_at >= CAST(@date_from AS date))
  AND (@date_to IS NULL OR uploaded_at < DATEADD(day, 1, CAST(@date_to AS date)))
ORDER BY uploaded_at DESC, id DESC
OFFSET @row_offset ROWS FETCH NEXT @row_limit ROWS ONLY
`;
