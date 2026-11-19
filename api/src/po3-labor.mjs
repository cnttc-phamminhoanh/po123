/**
 * Chi phí nhân công PO3.
 *
 * SQL này chạy trên **máy chủ cũ** (pool OLD_DB_*), nơi có 3 bảng gốc:
 *   ig_pywrkord / ig_pywrkstp / ig_pystpasm.
 * Dữ liệu SO và size_grp_gi được lấy qua linked server [RDS_PO123] như SQL gốc.
 *
 * Không còn dùng bảng tổng hợp ig_wo_step_avg_cost.
 * Size cost của NEXT được map theo tên size và khoảng tháng; chi phí labor
 * lấy trung bình (AVG) theo từng mã F thay vì cộng dồn các WO tốt nhất.
 */
export const SQL_PO3_LABOR = `
SET NOCOUNT ON;

DECLARE @style    varchar(60)  = @p_style;
DECLARE @season   varchar(50)  = @p_season;
DECLARE @size_grp varchar(100) = @p_size_grp;

SET @style    = REPLACE(REPLACE(LTRIM(RTRIM(@style)), ' ', ''), '''', '');
SET @season   = NULLIF(LTRIM(RTRIM(@season)), '');
SET @size_grp = NULLIF(LTRIM(RTRIM(@size_grp)), '');

DECLARE
    @sql       nvarchar(max),
    @rq        nvarchar(max),
    @is_haddad bit,
    @len       int,
    @s         varchar(50),
    @cust_name nvarchar(255),
    @vnd_rate  decimal(18,8),
    @g         varchar(100),
    @has_size  bit;

DROP TABLE IF EXISTS #best;
DROP TABLE IF EXISTS #ranked;
DROP TABLE IF EXISTS #wo_process;
DROP TABLE IF EXISTS #step_cost;
DROP TABLE IF EXISTS #stp;
DROP TABLE IF EXISTS #sc;
DROP TABLE IF EXISTS #asm;
DROP TABLE IF EXISTS #sg_sz;
DROP TABLE IF EXISTS #grp_n;
DROP TABLE IF EXISTS #so_sz;
DROP TABLE IF EXISTS #line_n;
DROP TABLE IF EXISTS #line_grp;
DROP TABLE IF EXISTS #so_sg;
DROP TABLE IF EXISTS #sg;
DROP TABLE IF EXISTS #candidate;
DROP TABLE IF EXISTS #wo_last;
DROP TABLE IF EXISTS #wo;
DROP TABLE IF EXISTS #so;
DROP TABLE IF EXISTS #goods_process;
DROP TABLE IF EXISTS #sg_so;
DROP TABLE IF EXISTS #asm_sz;
DROP TABLE IF EXISTS #sz_map;

/* 1. Lấy danh sách SO từ ERP T8 (linked server RDS_PO123) */
CREATE TABLE #so (
    so_no      varchar(20),
    so_id      int,
    f_goods    varchar(30),
    season     varchar(50),
    cust_no    varchar(20),
    cust_name  nvarchar(255),
    bar_no     varchar(100),
    sheet_qty  numeric(18,8),
    sheet_date datetime,
    qty01 numeric(18,8), qty02 numeric(18,8),
    qty03 numeric(18,8), qty04 numeric(18,8),
    qty05 numeric(18,8), qty06 numeric(18,8),
    qty07 numeric(18,8), qty08 numeric(18,8),
    qty09 numeric(18,8), qty10 numeric(18,8),
    qty11 numeric(18,8), qty12 numeric(18,8),
    qty13 numeric(18,8), qty14 numeric(18,8),
    qty15 numeric(18,8), qty16 numeric(18,8),
    c01 varchar(50), c02 varchar(50),
    c03 varchar(50), c04 varchar(50),
    c05 varchar(50), c06 varchar(50),
    c07 varchar(50), c08 varchar(50),
    c09 varchar(50), c10 varchar(50),
    c11 varchar(50), c12 varchar(50),
    c13 varchar(50), c14 varchar(50),
    c15 varchar(50), c16 varchar(50)
);

SET @rq = N'
SELECT
    s.sheet_no,
    s.sheet_id,
    s.goods_no,
    LTRIM(RTRIM(ISNULL(g.goods_model, ''''))),
    s1.cust_no1,
    c.cust_name1,
    REPLACE(g.bar_no, '' '', ''''),
    s.sheet_qty,
    s1.sheet_date,
    s.qty01,s.qty02,s.qty03,s.qty04,
    s.qty05,s.qty06,s.qty07,s.qty08,
    s.qty09,s.qty10,s.qty11,s.qty12,
    s.qty13,s.qty14,s.qty15,s.qty16,
    bc.qty_c01,bc.qty_c02,bc.qty_c03,bc.qty_c04,
    bc.qty_c05,bc.qty_c06,bc.qty_c07,bc.qty_c08,
    bc.qty_c09,bc.qty_c10,bc.qty_c11,bc.qty_c12,
    bc.qty_c13,bc.qty_c14,bc.qty_c15,bc.qty_c16
FROM erp_t8_GI.dbo.sal_order2 s WITH (NOLOCK)
JOIN erp_t8_GI.dbo.sal_order1 s1 WITH (NOLOCK)
    ON s1.sheet_no = s.sheet_no
JOIN erp_t8_GI.dbo.bas_goods g WITH (NOLOCK)
    ON g.goods_no = s.goods_no
LEFT JOIN erp_t8_GI.dbo.bas_cust c WITH (NOLOCK)
    ON c.cust_no = s1.cust_no1
LEFT JOIN erp_t8_GI.dbo.bas_base_code bc WITH (NOLOCK)
    ON bc.code_type = ''070''
   AND bc.base_code = g.mat_type
WHERE g.bar_no LIKE ''' + LEFT(@style,8) + N'%''
  AND s1.sheet_type IN (''SOGI'',''SOCGI'')
  AND s1.sheet_sta = ''1''
  AND s.sheet_sta = ''1''
  AND (s.close_type IS NULL OR LEFT(s.close_type,1) <> ''1'')
  AND LEFT(s.goods_no,1) = ''F''
  AND ISNULL(s1.cust_no1, '''') <> ''10003''
  AND ISNULL(s1.cust_ord_no, '''') NOT IN (''GISTOCK'', N''GI库存'')
  AND LEFT(s1.sheet_no, 3) <> ''SOD''';

SET @sql = N'INSERT INTO #so SELECT * FROM OPENQUERY([RDS_PO123], ''' + REPLACE(@rq, '''', '''''') + N''')';
EXEC (@sql);

/* 2. Phân loại HADDAD / NON-HADDAD, lọc SO theo style */
SET @is_haddad =
    CASE
        WHEN EXISTS (
            SELECT 1 FROM #so
            WHERE cust_no IN ('10015','10110')
               OR cust_name LIKE '%HADDAD%'
        ) THEN 1 ELSE 0
    END;

SET @len = CASE WHEN @is_haddad = 1 THEN 8 ELSE 60 END;

DELETE FROM #so
WHERE LEFT(REPLACE(bar_no,' ',''), @len) <> LEFT(@style, @len);

IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
    /* Không có SO: trả rỗng để API coi nhân công = 0, không làm sập trang. */
    RETURN;
END;

SELECT TOP 1 @cust_name = cust_name FROM #so;

/* 3. Chọn season */
SET @s = @season;
IF @s IS NULL
BEGIN
    SELECT TOP 1 @s = season
    FROM #so
    ORDER BY sheet_date DESC, so_no DESC;
END;
SET @s = ISNULL(@s, '');

DELETE FROM #so
WHERE ISNULL(season, '') <> @s;

IF NOT EXISTS (SELECT 1 FROM #so)
BEGIN
    RETURN;
END;

/* 4. Lấy WO từ ig_pywrkord (bảng gốc trên máy chủ cũ) */
SELECT
    o.wrk_order AS wo,
    o.apply_date AS wo_date,
    LTRIM(RTRIM(o.buyer)) AS buyer,
    LEFT(REPLACE(o.ext_field10,' ',''),60) AS cust_style,
    LEFT(o.style,30) AS c_style,
    LEFT(REPLACE(o.ext_field06,' ',''),30) AS f_goods,
    LEFT(REPLACE(o.ext_field09,' ',''),30) AS sf_goods,
    CASE RIGHT(o.wrk_order,2)
        WHEN 'T8' THEN 1
        WHEN '-P' THEN 3
        WHEN 'TA' THEN 4
        WHEN 'TB' THEN 5
        WHEN 'TD' THEN 6
        WHEN 'TH' THEN 7
        ELSE 1
    END AS wo_type1
INTO #wo
FROM ig_pywrkord o WITH (NOLOCK)
WHERE LEFT(REPLACE(o.ext_field10,' ',''), @len) = LEFT(@style, @len)
  AND EXISTS (
      SELECT 1
      FROM #so x
      WHERE ',' + REPLACE(o.ext_field02,' ','') + ','
            LIKE '%,' + x.so_no + ',%'
  );

IF NOT EXISTS (SELECT 1 FROM #wo)
BEGIN
    RETURN;
END;

/* 5. WO mới nhất theo c_style + wo_type1 */
SELECT
    w.*,
    ROW_NUMBER() OVER (
        PARTITION BY w.c_style, w.wo_type1
        ORDER BY w.wo_date DESC
    ) AS last_wo_seq
INTO #wo_last
FROM #wo w;

/* 6. Xác định WO */
SELECT TOP (0)
    w.*,
    CAST(NULL AS bigint) AS style_seq
INTO #candidate
FROM #wo_last w;

IF @is_haddad = 1
BEGIN
    INSERT INTO #candidate
    SELECT
        x.wo, x.wo_date, x.buyer, x.cust_style, x.c_style,
        x.f_goods, x.sf_goods, x.wo_type1, x.last_wo_seq, x.style_seq
    FROM (
        SELECT
            w.*,
            ROW_NUMBER() OVER (
                PARTITION BY LEFT(w.cust_style,8), w.f_goods, w.sf_goods
                ORDER BY w.wo_date ASC
            ) AS style_seq
        FROM #wo_last w
        WHERE w.last_wo_seq = 1
          AND UPPER(LTRIM(RTRIM(w.buyer))) = 'HADDAD'
    ) x
    WHERE x.style_seq = 1;
END
ELSE
BEGIN
    INSERT INTO #candidate
    SELECT
        w.*,
        CAST(NULL AS bigint) AS style_seq
    FROM #wo_last w
    WHERE w.last_wo_seq = 1;
END;

IF NOT EXISTS (SELECT 1 FROM #candidate)
BEGIN
    RETURN;
END;

/* 7. Map size group từ size_grp_gi (RDS_PO123) */
SELECT * INTO #sg
FROM OPENQUERY([RDS_PO123], '
SELECT
    cust_name,
    size_grp,
    size1,size2,size3,size4,size5,size6,size7,size8,
    size9,size10,size11,size12,size13,size14,size15,size16
FROM erp_t8_GI.dbo.size_grp_gi WITH (NOLOCK)
');

DELETE FROM #sg
WHERE cust_name <> @cust_name;

IF @is_haddad = 1
BEGIN
    DELETE FROM #sg
    WHERE size_grp = 'HADDAD-12';
END;

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

SELECT
    size_grp,
    COUNT(DISTINCT sz) AS n_def
INTO #grp_n
FROM #sg_sz
GROUP BY size_grp;

/* 8. Size và qty thực tế trên từng SO */
SELECT
    s.so_no,
    s.so_id,
    s.f_goods,
    UPPER(REPLACE(LTRIM(RTRIM(v.sz)), ' ', '')) AS sz,
    v.q AS qty
INTO #so_sz
FROM #so s
CROSS APPLY (
    VALUES
        (s.qty01,s.c01),(s.qty02,s.c02),
        (s.qty03,s.c03),(s.qty04,s.c04),
        (s.qty05,s.c05),(s.qty06,s.c06),
        (s.qty07,s.c07),(s.qty08,s.c08),
        (s.qty09,s.c09),(s.qty10,s.c10),
        (s.qty11,s.c11),(s.qty12,s.c12),
        (s.qty13,s.c13),(s.qty14,s.c14),
        (s.qty15,s.c15),(s.qty16,s.c16)
) v(q,sz)
WHERE v.q > 0
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

;WITH cover AS (
    SELECT
        z.so_no,
        z.so_id,
        z.f_goods,
        g.size_grp,
        COUNT(DISTINCT z.sz) AS n_matched,
        gn.n_def
    FROM #so_sz z
    INNER JOIN #sg_sz g
        ON g.sz = z.sz
    INNER JOIN #grp_n gn
        ON gn.size_grp = g.size_grp
    GROUP BY
        z.so_no,
        z.so_id,
        z.f_goods,
        g.size_grp,
        gn.n_def
),
best AS (
    SELECT
        c.so_no,
        c.so_id,
        c.f_goods,
        c.size_grp,
        c.n_matched,
        c.n_def,
        ROW_NUMBER() OVER (
            PARTITION BY c.so_no, c.so_id, c.f_goods
            ORDER BY
                CASE WHEN c.n_matched = ln.n_sz THEN 0 ELSE 1 END,
                c.n_matched DESC,
                c.n_def,
                c.size_grp
        ) AS rn
    FROM cover c
    INNER JOIN #line_n ln
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
INNER JOIN #line_n ln
    ON ln.so_no = b.so_no
   AND ln.so_id = b.so_id
   AND ln.f_goods = b.f_goods
WHERE b.rn = 1
  AND b.n_matched = ln.n_sz;

/* Qty theo size_grp đã chọn cho từng SO */
SELECT
    z.so_no,
    z.so_id,
    z.f_goods,
    lg.size_grp,
    SUM(z.qty) AS qty
INTO #so_sg
FROM #so_sz z
INNER JOIN #line_grp lg
    ON lg.so_no = z.so_no
   AND lg.so_id = z.so_id
   AND lg.f_goods = z.f_goods
INNER JOIN #sg_sz gs
    ON gs.size_grp = lg.size_grp
   AND gs.sz = z.sz
GROUP BY
    z.so_no,
    z.so_id,
    z.f_goods,
    lg.size_grp
UNION ALL
/* SO không có size thì đưa về COMMON-999 */
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

/* SO có size nhưng không khớp group nào thì đưa về COMMON-999 */
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

SET @has_size =
    CASE
        WHEN EXISTS (
            SELECT 1 FROM #so_sg
            WHERE size_grp <> 'COMMON-999'
        ) THEN 1 ELSE 0
    END;

IF @has_size = 0
BEGIN
    UPDATE #so_sg
    SET size_grp = 'COMMON-999';
END;

/* 9. Chọn size group:
   - Nếu UI truyền group không tồn tại thì @g = NULL (trả rỗng, không tự đổi).
   - Nếu không truyền thì tự chọn như SQL cũ.
*/
SET @g = NULL;

IF @size_grp IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM #so_sg
        WHERE size_grp = @size_grp
    )
    BEGIN
        SET @g = @size_grp;
    END;
END
ELSE
BEGIN
    IF @has_size = 0
    BEGIN
        SET @g = 'COMMON-999';
    END
    ELSE
    BEGIN
        SELECT TOP 1 @g = size_grp
        FROM #so_sg
        WHERE size_grp <> 'COMMON-999'
        ORDER BY
            TRY_CAST(
                SUBSTRING(size_grp, CHARINDEX('-', size_grp) + 1, 10)
                AS int
            ),
            size_grp;
    END;
END;

IF @g IS NULL
BEGIN
    RETURN;
END;

/* 10. Size cost từ ig_pystpasm + ig_pywrkstp */
SELECT
    s.wrk_order AS wo,
    s.step_no,
    UPPER(REPLACE(a.sizx,' ','')) AS sz,
    MAX(CAST(a.cost AS decimal(18,8))) AS cost
INTO #asm
FROM ig_pystpasm a WITH (NOLOCK)
JOIN #candidate w
    ON w.wo = a.wrk_order
JOIN ig_pywrkstp s WITH (NOLOCK)
    ON s.wrk_order = a.wrk_order
   AND s.step_no = a.step_no
GROUP BY
    s.wrk_order,
    s.step_no,
    UPPER(REPLACE(a.sizx,' ',''));

/* 10b. Map size ig_pystpasm -> nhóm size.
   NEXT: ưu tiên khớp đúng tên size, sau đó khớp khoảng tháng (6M, 2Y...).
   Khách khác: khớp đúng tên size như cũ. */
SELECT g.size_grp, g.sz
INTO #sg_so
FROM #sg_sz g
WHERE g.size_grp IN (
    SELECT DISTINCT size_grp
    FROM #so_sg
    WHERE size_grp <> 'COMMON-999'
);

SELECT DISTINCT sz
INTO #asm_sz
FROM #asm;

SELECT s.sz, m.size_grp
INTO #sz_map
FROM #asm_sz s
OUTER APPLY (
    SELECT DISTINCT r.size_grp
    FROM (
        SELECT q.size_grp, q.match_rank,
               MIN(q.match_rank) OVER () AS best_rank
        FROM (
            SELECT g.size_grp,
                   CASE
                       WHEN g.sz = s.sz
                         OR (s.sz = 'FIRST' AND g.sz = 'FIRSTSIZE')
                           THEN 1
                       WHEN av.asm_month IS NOT NULL
                        AND gv.min_month IS NOT NULL
                        AND gv.max_month IS NOT NULL
                        AND av.asm_month BETWEEN gv.min_month AND gv.max_month
                           THEN 2
                   END AS match_rank
            FROM #sg_so g
            CROSS APPLY (
                SELECT
                    CASE
                        WHEN s.sz LIKE '[0-9]%M'
                         AND LEFT(s.sz, LEN(s.sz)-1) NOT LIKE '%[^0-9]%'
                            THEN CAST(LEFT(s.sz, LEN(s.sz)-1) AS int)
                        WHEN s.sz LIKE '[0-9]%Y'
                         AND LEFT(s.sz, LEN(s.sz)-1) NOT LIKE '%[^0-9]%'
                            THEN CAST(LEFT(s.sz, LEN(s.sz)-1) AS int) * 12
                    END AS asm_month
            ) av
            CROSS APPLY (
                SELECT
                    CASE WHEN g.sz LIKE '[0-9]%-[0-9]%[MY]' AND g.sz <> '1-1/2-2Y'
                         THEN LEFT(g.sz, CHARINDEX('-', g.sz) - 1) END AS min_txt,
                    CASE WHEN g.sz LIKE '[0-9]%-[0-9]%[MY]' AND g.sz <> '1-1/2-2Y'
                         THEN SUBSTRING(g.sz, CHARINDEX('-', g.sz) + 1,
                                        LEN(g.sz) - CHARINDEX('-', g.sz) - 1) END AS max_txt,
                    CASE WHEN RIGHT(g.sz,1) = 'Y' THEN 12 ELSE 1 END AS mul
            ) gt
            CROSS APPLY (
                SELECT
                    CASE
                        WHEN g.sz = '1-1/2-2Y' THEN 18
                        WHEN gt.min_txt IS NOT NULL
                         AND gt.min_txt NOT LIKE '%[^0-9]%'
                            THEN CAST(gt.min_txt AS int) * gt.mul
                    END AS min_month,
                    CASE
                        WHEN g.sz = '1-1/2-2Y' THEN 24
                        WHEN gt.max_txt IS NOT NULL
                         AND gt.max_txt NOT LIKE '%[^0-9]%'
                            THEN CAST(gt.max_txt AS int) * gt.mul
                    END AS max_month
            ) gv
            WHERE UPPER(LTRIM(RTRIM(ISNULL(@cust_name,'')))) = 'NEXT'
        ) q
        WHERE q.match_rank IS NOT NULL
    ) r
    WHERE r.match_rank = r.best_rank
    UNION
    SELECT DISTINCT g.size_grp
    FROM #sg_sz g
    WHERE UPPER(LTRIM(RTRIM(ISNULL(@cust_name,'')))) <> 'NEXT'
      AND g.sz = s.sz
) m;

/* Map size cost theo nhóm */
SELECT
    a.wo,
    a.step_no,
    ISNULL(m.size_grp,'COMMON-999') AS size_grp,
    MAX(a.cost) AS asm_cost
INTO #sc
FROM #asm a
LEFT JOIN #sz_map m
    ON m.sz = a.sz
GROUP BY
    a.wo,
    a.step_no,
    ISNULL(m.size_grp,'COMMON-999');

/* 11. Chi phí đầu (VND) */
SELECT
    s.wrk_order AS wo,
    w.c_style,
    s.step_no,
    s.process AS raw_process,
    s.cost / NULLIF(s.cost_unit,0) AS base_pcs,
    s.cost_unit
INTO #stp
FROM ig_pywrkstp s WITH (NOLOCK)
JOIN #candidate w
    ON w.wo = s.wrk_order;

SELECT
    t.wo,
    t.c_style,
    t.step_no,
    t.raw_process,
    ISNULL(
        CASE
            WHEN @g = 'COMMON-999'
            THEN (
                SELECT MAX(a.asm_cost)
                FROM #sc a
                WHERE a.wo = t.wo
                  AND a.step_no = t.step_no
            )
            ELSE (
                SELECT MAX(a.asm_cost)
                FROM #sc a
                WHERE a.wo = t.wo
                  AND a.step_no = t.step_no
                  AND a.size_grp = @g
            )
        END / NULLIF(t.cost_unit,0),
        t.base_pcs
    ) AS pcs_vnd
INTO #step_cost
FROM #stp t;

/* 12. Tổng theo WO + process */
SELECT
    wo,
    c_style,
    raw_process,
    SUM(pcs_vnd) AS pcs_vnd
INTO #wo_process
FROM #step_cost
GROUP BY wo, c_style, raw_process;

/* 13. WO có cost cao nhất theo c_style + process */
SELECT
    p.*,
    ROW_NUMBER() OVER (
        PARTITION BY p.c_style, p.raw_process
        ORDER BY p.pcs_vnd DESC
    ) AS process_seq
INTO #ranked
FROM #wo_process p;

SELECT
    wo,
    c_style,
    raw_process,
    pcs_vnd
INTO #best
FROM #ranked
WHERE process_seq = 1;

/* 14. Tỷ giá USD từ RDS_PO123 */
SELECT TOP 1 @vnd_rate = cur_rate
FROM [RDS_PO123].erp_t8_GI.dbo.bas_cur WITH (NOLOCK)
WHERE cur_code = 'USD';

IF ISNULL(@vnd_rate,0) = 0
BEGIN
    RETURN;
END;

/* 15. PO3 LB cost */
SELECT
    LEFT(b.c_style, LEN(b.c_style)-1) AS base_style,
    w.f_goods,
    CASE LEFT(b.raw_process,3)
        WHEN 'CUT' THEN 'CUT'
        WHEN 'PRI' THEN 'PRI'
        WHEN 'EMB' THEN 'EMB'
        WHEN 'SEW' THEN 'SEW'
        WHEN 'FIN' THEN 'FIN'
        WHEN 'BUT' THEN 'FIN'
        WHEN 'IRO' THEN 'FIN'
        WHEN 'SOC' THEN 'SOC'
        WHEN 'PAC' THEN 'PAC'
        ELSE 'ETC'
    END AS process,
    SUM(b.pcs_vnd) AS pcs_vnd
INTO #goods_process
FROM #best b
INNER JOIN #candidate w
    ON w.wo = b.wo
GROUP BY
    LEFT(b.c_style, LEN(b.c_style)-1),
    w.f_goods,
    CASE LEFT(b.raw_process,3)
        WHEN 'CUT' THEN 'CUT'
        WHEN 'PRI' THEN 'PRI'
        WHEN 'EMB' THEN 'EMB'
        WHEN 'SEW' THEN 'SEW'
        WHEN 'FIN' THEN 'FIN'
        WHEN 'BUT' THEN 'FIN'
        WHEN 'IRO' THEN 'FIN'
        WHEN 'SOC' THEN 'SOC'
        WHEN 'PAC' THEN 'PAC'
        ELSE 'ETC'
    END;

;WITH process_cost AS (
    SELECT
        process,
        AVG(pcs_vnd / NULLIF(@vnd_rate,0)) AS pcs_usd
    FROM #goods_process
    GROUP BY process
),
base AS (
    SELECT
        SUM(CASE WHEN process='CUT' THEN pcs_usd ELSE 0 END) AS cut,
        SUM(CASE WHEN process='PRI' THEN pcs_usd ELSE 0 END) AS pri,
        SUM(CASE WHEN process='EMB' THEN pcs_usd ELSE 0 END) AS emb,
        SUM(CASE WHEN process='SEW' THEN pcs_usd ELSE 0 END) AS sew,
        SUM(CASE WHEN process='FIN' THEN pcs_usd ELSE 0 END) AS fin,
        SUM(CASE WHEN process='SOC' THEN pcs_usd ELSE 0 END) AS soc,
        SUM(CASE WHEN process='PAC' THEN pcs_usd ELSE 0 END) AS pac,
        SUM(CASE WHEN process='ETC' THEN pcs_usd ELSE 0 END) AS etc
    FROM process_cost
),
x AS (
    SELECT
        *,
        ISNULL(cut,0) + ISNULL(soc,0) + ISNULL(sew,0)
        + ISNULL(fin,0) + ISNULL(pac,0) + ISNULL(etc,0) AS x_emb_pri,
        ISNULL(pri,0) + ISNULL(emb,0) AS emb_pri
    FROM base
)
SELECT
    'PO3' AS po_type,
    @style AS cust_style,
    @s AS season,
    @g AS size_grp,
    CASE WHEN @is_haddad=1 THEN 'HADDAD' ELSE 'NON-HADDAD' END AS buyer,
    @vnd_rate AS ty_gia,
    cut,
    pri,
    emb,
    sew,
    fin,
    soc,
    pac,
    etc,
    x_emb_pri,
    emb_pri,
    x_emb_pri * 0.61 * 1.6 AS overhead,
    emb_pri + (x_emb_pri * 0.61 * 1.6) + (x_emb_pri * 1.6) AS l_ttl
FROM x;
`;
