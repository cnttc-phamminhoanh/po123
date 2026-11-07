# PO123 API — Express + SQL Server

Backend thật cho UI PO cost summary. Không còn mock: mọi số liệu lấy từ SQL Server qua `mssql` (pool kết nối, query tham số hoá).

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
| `PORT` | `3001` | Cổng API |
| `CORS_ORIGIN` | `http://localhost:5174` | Origin được phép gọi API |

## Endpoint

Base: `/api/bom`

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/styles` | Danh sách style + season + size group |
| GET | `/styles/:code?season=` | Chi tiết style + 4 cột PO (chỉ PO1 có số liệu) |
| PATCH | `/styles/:code/pos/:poNo` | Chưa mở — trả 501, không ghi vào bảng ERP |
| POST | `/styles/photos` | Gán ảnh theo `styleCode`, lưu tạm trong RAM |
| GET | `/health` | Kiểm tra API + kết nối DB |

## Cách lấy số liệu

- **PO1** = báo giá mới nhất của style trong season/size group đang xem:
  `sal_po_costing1` (header, FOB `def06`, factory `def05`, version `ver_no`) +
  `sal_po_costing3` (vật tư) + `sal_po_costing2` (nhân công) + `sal_po_costing4` (chi phí khác).
- **Style** so khớp theo khách: HADDAD so 8 ký tự đầu của `def04`, khách khác so nguyên chuỗi.
- **Season** mặc định: bản ghi có `check_date` mới nhất.
- **Size group** mặc định: quy ước trong tài liệu (ưu tiên bản ghi mới nhất khi có `COMMON-999`, ngược lại nhóm có số nhỏ nhất).
- **Số lượng / ngày giao** lấy từ `sal_order1/2` + `sal_out1/2`.
- Đơn giá và chi phí trong `sal_po_costing2/3/4` đang ở đơn vị **/1000 USD**, API chia 1000 khi trả về.

## Quy ước hiển thị (theo yêu cầu hiện tại)

1. Chỉ **PO1** có dữ liệu thật; **PO2A / PO2B / PO3 trả 0** để dễ nhận biết.
2. Bỏ **SAM**: `sam`, `efficiency`, `laborRate` trả 0, UI không còn hiện dòng SAM.
3. Vật tư: `m1 → fabric`, `m2 (+ opa) → trim`, `m3 → pack`; `wash = 0` (dữ liệu chưa tách).
4. Nhân công 4 công đoạn: `cut`, `sew` (gồm PRI + EMB), `fin` (gồm ETC + SOC), `pack`.
5. Chi phí khác: toàn bộ `sal_po_costing4` gộp vào `Overhead`; `QC` và `Freight` = 0 vì chưa có bảng ánh xạ `fee_type → nhóm`.
6. Ảnh: style thật chưa có ảnh nên ô ảnh để trống; ảnh upload chỉ lưu trong RAM, mất khi restart (chưa có bảng lưu ảnh).

## Ghi chú kỹ thuật

- Mỗi lần mở một style: 3 query (context, chi phí PO1, số lượng đơn hàng). Có thể gộp context + chi phí thành một batch/CTE và chạy song song khi cần tối ưu thêm.
- Toàn bộ SQL tập trung ở `src/sql.mjs`, không rải trong route.
- `query()` trong `src/db.mjs` là điểm duy nhất mở kết nối; thêm query mới thì thêm hàm vào `service.mjs`, giữ route mỏng.
