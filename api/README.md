# PO123 API — Express + SQL Server

Backend cho UI PO123. Dữ liệu lấy từ SQL Server qua `mssql`, dùng pool kết nối và query tham số hoá.

- Database chính: thông tin style, PO1, PO2A, PO2B, PO3 material, PO3 FOB price.
- Database cũ: nhân công PO3 (`ig_pywrkord`, `ig_pywrkstp`, `ig_pystpasm`) qua cấu hình `OLD_DB_*`.

## Chạy local

Yêu cầu: Node 22.

```bash
cd api
npm install

# Tạo file cấu hình
# Windows: copy .env.example .env
# Linux/macOS: cp .env.example .env
# Điền DB_*, OLD_DB_* và AUTH_SECRET
```

Chạy riêng API:

```bash
npm run dev      # node --watch
npm start        # không watch
```

Chạy API + UI cùng lúc, từ thư mục `ui/`:

```bash
cd ../ui
npm run dev
```

Mặc định khi dev:

- API: `http://127.0.0.1:3001`
- UI: `http://localhost:5174`
- Vite chuyển `/api/...` xuống API.

Kiểm tra API:

```text
GET http://127.0.0.1:3001/health
```

Kết quả `{ "ok": true, "db": "up" }` nếu kết nối database được.

## Biến môi trường (`api/.env`)

| Biến | Ví dụ | Ý nghĩa |
| --- | --- | --- |
| `DB_SERVER` | `sql-host` | Host SQL Server chính |
| `DB_PORT` | `1433` | Cổng; dùng named instance thì để trống |
| `DB_INSTANCE` | `SQLEXPRESS` | Tên instance (nếu có) |
| `DB_NAME` | `erp_t8_gi` | Database chính |
| `DB_USER` / `DB_PASSWORD` | `po123_app` / `...` | Tài khoản ứng dụng, không dùng `sa` |
| `DB_ENCRYPT` | `false` | Bật TLS |
| `DB_TRUST_CERT` | `true` | Bỏ qua kiểm tra chứng chỉ tự ký |
| `OLD_DB_SERVER` | `old-sql-host` | Host máy chủ cũ chứa 3 bảng `ig_*` |
| `OLD_DB_PORT` | `9000` | Cổng máy chủ cũ |
| `OLD_DB_NAME` | `gi_BI` | Database chứa 3 bảng `ig_*` |
| `OLD_DB_USER` / `OLD_DB_PASSWORD` | `po123_old_app` / `...` | Tài khoản ứng dụng trên máy chủ cũ |
| `OLD_DB_INSTANCE` | | Named instance (nếu có) |
| `OLD_DB_ENCRYPT` / `OLD_DB_TRUST_CERT` | `false` / `true` | TLS của máy chủ cũ |
| `OLD_DB_DOMAIN` | | Domain nếu dùng Windows/NTLM |
| `PORT` | `3001` | Cổng API khi dev |
| `API_HOST` | `127.0.0.1` | Địa chỉ API lắng nghe |
| `CORS_ORIGIN` | `http://localhost:5174` | Origin được phép gọi API; production cùng origin qua proxy thì không phụ thuộc CORS |
| `PHOTO_DIR` | `C:\po123-data\photos` | Thư mục ảnh style; production dùng `/var/lib/po123/photos` |
| `PHOTO_MAX_MB` | `8` | Dung lượng tối đa mỗi ảnh |
| `AUTH_USER` | `admin` | Admin đầu tiên, chỉ dùng khi bảng tài khoản còn trống |
| `AUTH_PASSWORD` | `...` | Mật khẩu admin đầu tiên |
| `AUTH_SECRET` | `...` | Khoá ký cookie phiên; bắt buộc để đăng nhập / upload |
| `AUTH_TTL_HOURS` | `168` | Thời hạn đăng nhập (giờ) |
| `COOKIE_SECURE` | `false` | Đặt `true` khi chạy HTTPS |

Production chạy theo [deploy/README.md](../deploy/README.md):

```dotenv
PORT=2405
API_HOST=127.0.0.1
PHOTO_DIR=/var/lib/po123/photos
```

File `deploy/ecosystem.config.cjs` cũng đặt các giá trị này khi pm2 khởi động, nên API không mở cổng 2405 ra ngoài.

## Endpoint

Base: `/api/bom`

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/styles` | Danh sách style kèm season, size group và số tổng hợp |
| GET | `/latest-style` | Style mới nhất; 404 nếu chưa có PO |
| GET | `/styles/:code?season=&sizeGroup=` | Chi tiết style + 4 cột PO |
| GET | `/styles/:code/photo` | Trả ảnh style từ `PHOTO_DIR` |
| POST | `/styles/:code/photo` | Upload ảnh, cần đăng nhập; `multipart/form-data`, field `file` |
| PATCH | `/styles/:code/pos/:poNo` | Chưa mở — trả `501`, không ghi vào ERP |
| GET | `/debug/counts` | Số liệu debug, dùng khi kiểm tra dữ liệu |

`GET /health` là route gốc, không nằm dưới `/api/bom`.

Base: `/api/auth`

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/login` | Body `{ "username", "password" }`; đặt cookie `HttpOnly` |
| GET | `/me` | Kiểm tra phiên hiện tại |
| POST | `/logout` | Đăng xuất |
| GET | `/users` | Danh sách tài khoản (admin) |
| POST | `/users` | Tạo tài khoản; body `{ "empNo", "password", "role" }` (admin) |
| PATCH | `/users/:id` | Đổi quyền / mật khẩu / trạng thái (admin) |
| GET | `/photo-history` | Lịch sử upload ảnh (admin) |

Lỗi trả theo dạng:

```json
{ "error": { "code": "NOT_FOUND", "message": "..." } }
```

## Đăng nhập và tài khoản

- Tài khoản lưu trong `dbo.po_app_user`; mật khẩu chỉ lưu hash `scrypt`.
- Tài khoản nhân viên dùng mã nhân viên (`emp_no`). API kiểm tra mã trong `dbo.bas_emp`, lấy `emp_name`.
- Mã không tồn tại trả `400 EMP_NOT_FOUND`.
- Thiếu `AUTH_SECRET` trả `503 AUTH_NOT_CONFIGURED`; upload bị khoá.
- Chỉ admin được quản lý tài khoản; xem dữ liệu, đổi season / size group và xuất PDF không cần đăng nhập.
- Không thể khoá hoặc hạ quyền admin đang hoạt động cuối cùng (`409 LAST_ADMIN`).
- Tạo nhanh bằng script: `node scripts/create-user.mjs <emp_no> <password> [admin|user]`.

## Ảnh style

- Mỗi style một ảnh; upload ảnh mới thay ảnh cũ.
- Ảnh được chuẩn hoá khi upload: cắt viền thừa, thay nền sáng bằng xám `#F4F4F4`, đưa vào khung dọc 2:3 (1200 × 1800), lưu JPG.
- Mỗi lần upload ghi một dòng vào `dbo.po_style_photo_audit`: style, file, tài khoản, mã nhân viên, thời điểm.
- Ảnh nằm trên ổ đĩa tại `PHOTO_DIR`, không nằm trong git; cần sao lưu thư mục này.

## Cách lấy số liệu

- **PO1**: báo giá mới nhất của style trong season / size group đang xem.
  `sal_po_costing1` (header, FOB `def06`, factory `def05`, version `ver_no`) +
  `sal_po_costing3` (vật tư) + `sal_po_costing2` (nhân công) + `sal_po_costing4` (chi phí khác).
- **PO2A material**: theo logic SQL cũ: mã F của style, dòng SO hợp lệ, MRP / pur_plan / pur_order.
  Các bảng chính: `bas_goods`, `sal_order1/2`, `bas_base_code`, `mrp_mrp2`, `pur_plan2`, `pur_order1/2`, `size_grp_gi`, `bom_stru1/2`, `bas_cur_acc`.
  Nếu season / size group không có dòng SO thì để 0, không tự đổi season.
- **PO2B material**: logic SQL cũ, giữ cách chọn SO / HADDAD / season / size group / MRP3 / MRP2 / forecast / BOM.
  Khác PO2A: tiền vật tư lấy từ phiếu nhập kho thực tế (`pur_notice1/2`, `pur_in1/2`, loại `PZGI`, `PIGI/PTGI/PTGIA`), quy đổi USD bằng `bas_cur_acc` theo `acc_period`, rồi phân bổ về SO + size group.
- **PO3 material**: theo sản xuất thực tế: MO (`sfc_mo1/2`) + phiếu xuất (`scm_out1/2`) + giá nhập (`pur_in1/2`) + BOM (`v_bom_stru2_sc_gi`), phân bổ về size group của SO.
- **PO3 FOB price**: chạy SQL `PO3 Avg SO Unit Price` trên database chính, bình quân `sheet_pri * pri_dis` theo lượng SO của đúng style / season / size group. Kết quả gắn vào `po.price` của PO3.
- **PO3 labor**: chạy SQL gốc trên database cũ, nơi có `ig_pywrkord` / `ig_pywrkstp` / `ig_pystpasm`.
  Dữ liệu SO và `size_grp_gi` lấy qua linked server `[RDS_PO123]`.
  UI hiện 8 cột (`cut`, `pri`, `emb`, `sew`, `fin`, `soc`, `pac`, `etc`) và dòng **Overhead** = `x * 0.61 * 1.6`, với `x = cut + soc + sew + fin + pac + etc`; tổng PO3 lấy `l_ttl`.
- **Style** so khớp theo khách: HADDAD so 8 ký tự đầu của `def04`; khách khác so nguyên chuỗi.
- **Season** mặc định: bản ghi có `check_date` mới nhất.
- **Size group** mặc định: nhóm có số nhỏ nhất; `COMMON-999` xếp cuối.
- **Số lượng / ngày giao**: `sal_order1/2` + `sal_out1/2`.
- Đơn giá trong `sal_po_costing2/3/4` đang ở đơn vị **/1000 USD**; API chia 1000 khi trả về.

## Quy ước hiển thị

1. **PO1** có dữ liệu thật.
2. **PO2A / PO2B**: Materials theo logic SQL cũ; Labors và Other Expenses lấy theo PO1; giá FOB theo PO1.
3. **PO3**: Materials theo logic SQL cũ; Labors theo logic SQL cũ; Other Expenses theo PO1; giá FOB lấy từ `PO3 Avg SO Unit Price`.
4. Bỏ **SAM**: `sam`, `efficiency`, `laborRate` trả 0; UI không hiện dòng SAM.
5. Vật tư: `m1 → fabric`, `m2 (+ opa) → trim`, `m3 → pack`; `wash = 0` vì dữ liệu chưa tách.
6. Nhân công 4 công đoạn trên UI: `cut`, `sew` (PRI + EMB), `fin` (ETC + SOC), `pack`.
7. Chi phí khác chia 3 nhóm: **QC**, **Freight**, còn lại **Overhead**; tổng `otherTotal` không đổi.

## Ghi chú kỹ thuật

- Mỗi lần mở một style chạy 8 query: context, PO1 cost, số lượng, PO2A, PO2B, PO3 material, PO3 labor, PO3 price.
- Sáu query độc lập chạy song song; lỗi của query vật liệu / nhân công / giá không làm hỏng toàn bộ trang chi tiết.
- SQL tập trung ở `src/sql.mjs` và các module `po2a-material.mjs`, `po2b-material.mjs`, `po3-material.mjs`, `po3-labor.mjs`.
- `query()` trong `src/db.mjs` là điểm mở kết nối chính; `queryOld()` dùng cho database cũ.
- `npm run lint` kiểm tra code API; `npm run lint:fix` tự sửa định dạng.
