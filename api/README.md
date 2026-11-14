# PO123 API — Express + SQL Server

Backend thật cho UI PO cost summary. Không còn mock: mọi số liệu lấy từ SQL Server qua `mssql` (pool kết nối, query tham số hoá). Riêng nhân công PO3 dùng pool thứ hai `OLD_DB_*` trỏ tới máy chủ cũ chứa `ig_pywrkord` / `ig_pywrkstp` / `ig_pystpasm`.

## Chạy

```powershell
# 1) cài phụ thuộc (chỉ lần đầu)
cd api
npm install

# 2) điền thông tin database
#    sửa file api/.env (copy từ .env.example)

# 3) chạy kèm UI (một lệnh duy nhất, từ thư mục ui)
cd ../ui
npm run dev
```

`npm run dev` ở `ui/` giờ khởi động **cả hai**: API ở `http://localhost:3001` và Vite ở `http://localhost:5174`. Vite proxy `/api` sang 3001 nên UI không cần cấu hình gì thêm.

Chạy riêng API:

```powershell
cd api
npm run dev      # node --watch
npm start        # không watch
```

Kiểm tra nhanh:

- `http://localhost:3001/health` → `{ "ok": true, "db": "up" }` nếu kết nối được SQL Server.
- `http://localhost:5174/api/bom/styles` → danh sách style thật.

## Biến môi trường (`api/.env`)

| Biến | Ví dụ | Ý nghĩa |
| --- | --- | --- |
| `DB_SERVER` | `192.168.1.20` | IP / host SQL Server |
| `DB_PORT` | `1433` | Cổng; dùng named instance thì để trống |
| `DB_INSTANCE` | `SQLEXPRESS` | Tên instance (nếu có) |
| `DB_NAME` | `PO123` | Database |
| `DB_USER` / `DB_PASSWORD` | `sa` / `...` | Tài khoản SQL |
| `DB_ENCRYPT` | `false` | Bật TLS |
| `DB_TRUST_CERT` | `true` | Bỏ qua kiểm tra chứng chỉ tự ký |
| `OLD_DB_SERVER` | `171.251.49.166` | Host máy chủ cũ chứa `ig_pywrkord` / `ig_pywrkstp` / `ig_pystpasm` |
| `OLD_DB_PORT` | `9000` | Cổng máy chủ cũ |
| `OLD_DB_NAME` | `erp_t8_GI` | Database chứa 3 bảng `ig_*` |
| `OLD_DB_USER` / `OLD_DB_PASSWORD` | `Fast` / `...` | Tài khoản SQL của máy chủ cũ |
| `OLD_DB_INSTANCE` | | Named instance (nếu có) |
| `OLD_DB_ENCRYPT` / `OLD_DB_TRUST_CERT` | `false` / `true` | TLS của máy chủ cũ |
| `OLD_DB_DOMAIN` | | Domain nếu dùng Windows/NTLM |
| `PORT` | `3001` | Cổng API |
| `CORS_ORIGIN` | `http://localhost:5174` | Origin được phép gọi API |
| `PHOTO_DIR` | `C:\po123-data\photos` | Thư mục lưu ảnh style trên máy chạy Node |
| `PHOTO_MAX_MB` | `8` | Dung lượng tối đa mỗi ảnh |
| `AUTH_USER` | `admin` | Tên admin đầu tiên (chỉ dùng khi bảng tài khoản còn trống) |
| `AUTH_PASSWORD` | `...` | Mật khẩu admin đầu tiên; đổi trong UI sau khi đăng nhập |
| `AUTH_SECRET` | `...` | Khóa ký cookie phiên; bắt buộc đặt chuỗi ngẫu nhiên dài |
| `AUTH_TTL_HOURS` | `168` | Thời hạn đăng nhập (giờ) |
| `COOKIE_SECURE` | `false` | Bật `true` khi chạy HTTPS |

## Đăng nhập nhiều người dùng

Mọi tài khoản **đang hoạt động** đều được upload / thay ảnh. Chỉ tài khoản `role=admin` mới được quản lý tài khoản. Xem dữ liệu, đổi season/size group và xuất PDF vẫn công khai.

- Tài khoản lưu trong bảng `dbo.po_app_user` của SQL Server; mật khẩu chỉ lưu hash `scrypt`.
- Tài khoản nhân viên được tạo bằng **mã nhân viên** (`emp_no`). API kiểm tra mã trong bảng `dbo.bas_emp`, lấy `emp_name` và lưu vào tài khoản. Mã không tồn tại trả `400 EMP_NOT_FOUND`.
- Lần đăng nhập / gọi `/api/auth/me` đầu tiên sẽ tự tạo bảng nếu chưa có. Nếu bảng trống và có `AUTH_USER` + `AUTH_PASSWORD`, API tạo admin đầu tiên từ hai biến này.
- `POST /api/auth/login` — body `{ "username": "<emp_no hoặc admin>", "password": "..." }`; API đặt cookie phiên `HttpOnly`.
- `GET /api/auth/me` — kiểm tra phiên hiện tại.
- `POST /api/auth/logout` — đăng xuất.
- `GET /api/auth/users` — danh sách tài khoản (admin).
- `POST /api/auth/users` — tạo tài khoản, body `{ "empNo": "00005", "password", "role": "admin"|"user" }` (admin).
- `PATCH /api/auth/users/:id` — đổi `role`, bật/tắt `active`, hoặc đặt lại `password` (admin).
- Không thể khóa hoặc hạ quyền admin đang hoạt động cuối cùng (`409 LAST_ADMIN`).
- Nếu thiếu `AUTH_SECRET`, API trả `503 AUTH_NOT_CONFIGURED` và upload bị khóa.
- Tạo tài khoản nhanh bằng script: `node scripts/create-user.mjs <emp_no> <password> [admin|user]`.

### Ghi lại lịch sử upload ảnh
- Mỗi lần upload/thay ảnh style, API thêm một dòng vào bảng `dbo.po_style_photo_audit`: mã style, tên file, tài khoản upload, mã nhân viên, tên nhân viên và thời điểm upload.
- Bảng tự tạo khi upload lần đầu; mỗi lần upload là một dòng riêng, không ghi đè lịch sử cũ.
- Admin xem và tìm lịch sử trong menu tài khoản → **Lịch sử upload**; tìm theo mã style, người upload và khoảng ngày.
- `GET /api/auth/photo-history?style=&uploader=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0` — chỉ admin.

## Endpoint

Base: `/api/bom`

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/styles` | Danh sách style + season + size group |
| GET | `/styles/:code?season=` | Chi tiết style + 4 cột PO (chỉ PO1 có số liệu) |
| GET | `/styles/:code/photo` | Trả ảnh của style từ ổ đĩa |
| POST | `/styles/:code/photo` | Upload ảnh (`multipart/form-data`, field `file`); **cần đăng nhập** |
| PATCH | `/styles/:code/pos/:poNo` | Chưa mở — trả 501, không ghi vào bảng ERP |
| GET | `/health` | Kiểm tra API + kết nối DB |

Base: `/api/auth`

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/photo-history` | Tìm lịch sử upload (admin); lọc `style`, `uploader`, `from`, `to`, `limit`, `offset` |

## Cách lấy số liệu

- **PO1** = báo giá mới nhất của style trong season/size group đang xem:
  `sal_po_costing1` (header, FOB `def06`, factory `def05`, version `ver_no`) +
  `sal_po_costing3` (vật tư) + `sal_po_costing2` (nhân công) + `sal_po_costing4` (chi phí khác).
- **PO2A material** = tính theo logic SQL cũ: mã F của style + dòng SO hợp lệ + MRP/pur_plan/pur_order; nếu `COMMON-999` thì chia theo tổng SL SO, nhóm size khác thì chia theo BOM và số lượng từng size. Các bảng chính: `bas_goods`, `sal_order1/2`, `bas_base_code`, `mrp_mrp2`, `pur_plan2`, `pur_order1/2`, `size_grp_gi`, `bom_stru1/2`, `bas_cur_acc`. Nếu season/size group đang xem không có dòng SO tương ứng thì để 0, không tự đổi sang season khác.
- **PO2B material** = tính theo logic SQL cũ, giữ nguyên cách chọn SO/HADDAD, season, size group, MRP3/MRP2/forecast và BOM. Điểm khác PO2A: tiền vật tư lấy từ **phiếu nhập kho thực tế** (`pur_notice1/2`, `pur_in1/2`, loại `PZGI`, `PIGI/PTGI/PTGIA`), quy đổi USD bằng `bas_cur_acc` theo `acc_period`, rồi phân bổ về SO + size group. Nếu season/size group đang xem không có dữ liệu thì để 0.
- **PO3 material** = tính theo logic SQL cũ từ **sản xuất thực tế**: MO (`sfc_mo1/2`) + phiếu xuất (`scm_out1/2`) + giá nhập kho (`pur_in1/2`) + BOM (`v_bom_stru2_sc_gi`), sau đó phân bổ về size group của SO. Nếu style/season/size group không có MO hoặc không có dòng xuất kho tương ứng thì để 0.
- **PO3 FOB unit price** = chạy SQL `PO3 Avg SO Unit Price` trên DB hiện tại (RDS), lấy bình quân `sheet_pri * pri_dis` theo lượng SO của đúng style / season / size group. Kết quả gắn vào `po.price` của PO3; không tự đổi `qty`/tổng của cột, nếu không có SO phù hợp thì giá = 0. Đây là giá bán, không phải material cost.
- **PO3 labor** = chạy đúng SQL gốc trên **máy chủ cũ** (`OLD_DB_*`), nơi có `ig_pywrkord` / `ig_pywrkstp` / `ig_pystpasm`. Dữ liệu SO và `size_grp_gi` lấy qua linked server `[RDS_PO123]` như SQL cũ. Dùng pool riêng `queryOld`, không dùng bảng tổng hợp `ig_wo_step_avg_cost`. UI hiển thị đúng 8 cột SQL (`cut/pri/emb/sew/fin/soc/pac/etc`) và thêm dòng **Overhead** = `x * 0.61 * 1.6`, với `x = cut+soc+sew+fin+pac+etc`; tổng PO3 lấy `l_ttl`. Người dùng tự áp công thức `x + 0.6x + 0.61*1.6x + emb_pri = l_ttl` để đối chiếu. Nếu chưa điền `OLD_DB_*`, query lỗi và nhân công PO3 = 0; không tự lấy nguồn khác.
- **Style** so khớp theo khách: HADDAD so 8 ký tự đầu của `def04`, khách khác so nguyên chuỗi.
- **Season** mặc định: bản ghi có `check_date` mới nhất.
- **Size group** mặc định: quy ước trong tài liệu (ưu tiên bản ghi mới nhất khi có `COMMON-999`, ngược lại nhóm có số nhỏ nhất).
- **Số lượng / ngày giao** lấy từ `sal_order1/2` + `sal_out1/2`.
- Đơn giá và chi phí trong `sal_po_costing2/3/4` đang ở đơn vị **/1000 USD**, API chia 1000 khi trả về.

## Quy ước hiển thị (theo yêu cầu hiện tại)

1. **PO1** có dữ liệu thật; **PO2A** có **Materials theo logic SQL cũ**, **Labors giống PO1**, **Other Expenses giống PO1** và **giá FOB bằng PO1**; **PO2B** có **Materials theo logic SQL cũ**, **Labors giống PO1**, **Other Expenses giống PO1** và **giá FOB bằng PO1**; **PO3** có **Materials theo logic SQL cũ**, **Labors theo logic SQL cũ**, **Other Expenses giống PO1**, **giá FOB lấy từ PO3 Avg SO Unit Price**; total cost của PO3 = material + labor + other.
2. Bỏ **SAM**: `sam`, `efficiency`, `laborRate` trả 0, UI không còn hiện dòng SAM.
3. Vật tư: `m1 → fabric`, `m2 (+ opa) → trim`, `m3 → pack`; `wash = 0` (dữ liệu chưa tách).
4. Nhân công 4 công đoạn: `cut`, `sew` (gồm PRI + EMB), `fin` (gồm ETC + SOC), `pack`.
5. Chi phí khác tách 3 nhóm: **QC** (`fee_type='503'`, `CP052%`, hoặc tên có test/kiểm/QC), **Freight** (`fee_type='505'`, hoặc tên có vận chuyển/transport/freight/shipping), còn lại vào **Overhead**. Tổng `otherTotal` không đổi.
6. Ảnh: lưu trên ổ đĩa tại `PHOTO_DIR` (mặc định `C:\po123-data\photos`), một style một ảnh; upload ảnh mới sẽ xóa ảnh cũ. Ảnh được chuẩn hóa khi upload: cắt viền thừa, thay nền sáng/đồng màu bằng xám `#F4F4F4`, đặt sản phẩm vào khung dọc 2:3 (1200 × 1800) và lưu JPG. Ảnh tồn tại qua restart, nhưng chỉ trên máy đang chạy Node — cần sao lưu thư mục này.

## Ghi chú kỹ thuật

- Mỗi lần mở một style: 7 query (context, chi phí PO1, số lượng đơn hàng, vật liệu PO2A, vật liệu PO2B, vật liệu PO3, nhân công PO3). Năm query độc lập (số lượng, PO2A, PO2B, PO3 material trên RDS; PO3 labor trên pool `OLD_DB_*`) chạy song song; lỗi riêng của query vật liệu/nhân công không làm hỏng toàn bộ trang chi tiết.
- Toàn bộ SQL tập trung ở `src/sql.mjs` và các module `po2a-material.mjs` / `po2b-material.mjs` / `po3-material.mjs` / `po3-labor.mjs`, không rải trong route.
- `query()` trong `src/db.mjs` là điểm duy nhất mở kết nối; thêm query mới thì thêm hàm vào `service.mjs`, giữ route mỏng.
