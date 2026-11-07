# Garment PO Cost Summary — standalone UI

Bản UI tách rời khỏi Miaoda cloud: React + Vite + TypeScript, tự build và deploy trên máy chủ của bạn, nối vào backend Node.js + database của riêng bạn qua HTTP API.

Giao diện, hành vi và dữ liệu hiển thị giống bản đang chạy trên Miaoda: dashboard 4 cột PO, chọn Style / Season / size group, sửa chi phí PO, xuất CSV, xuất PDF A3, xem chi tiết style, API access.

## Cấu trúc

```
standalone/
├── index.html
├── vite.config.ts             # dev server 5174 + proxy /api → http://localhost:3001
├── dev.mjs                    # chạy song song API thật (../api) + Vite (npm run dev)
└── src/
    ├── main.tsx               # QueryClientProvider + Toaster + page
    ├── types.ts               # hợp đồng dữ liệu frontend ↔ backend (nguồn duy nhất)
    ├── lib/http.ts            # fetch wrapper: base URL, bearer token, đọc lỗi
    ├── lib/upload.ts          # upload ảnh qua VITE_UPLOAD_URL
    ├── lib/logger.ts
    ├── ui/                    # primitive UI (dialog, select, form, input, button, label, image)
    ├── styles/theme.css       # design token
    └── page/                  # toàn bộ trang: components/, dialogs/, utils/, page.css
```

`src/page/` chỉ phụ thuộc `src/lib`, `src/ui`, `src/types` — không còn import nào của `@lark-apaas/client-toolkit`.

## Chạy thử

```bash
cd ui
npm install
npm run dev          # API thật :3001 + UI :5174
```

Mở `http://localhost:5174`. Trước khi chạy, điền thông tin SQL Server vào `api/.env` (xem `api/README.md`). Thư mục `mock/` không còn được dùng.

Kiểm tra API sống: `http://localhost:3001/health` → `{ "ok": true, "db": "up" }`.

Chỉ chạy UI (khi API đã chạy sẵn ở nơi khác):

```bash
npm run dev:ui
```

## Chuẩn code & lint

Cả dự án dùng chung một bộ quy ước, cấu hình tại `eslint.config.js` (ESLint flat config, áp cho `src/`, `vite.config.ts`, `mock/`, `dev.mjs`).

```bash
npm run lint       # kiểm tra toàn bộ
npm run lint:fix   # tự sửa các lỗi định dạng
```

Quy ước chính: thụt 2 space, nháy đơn, luôn có dấu `;`, dấu phẩy ở cuối dòng khi xuống dòng, có khoảng trắng trong `{ ... }`, không để khoảng trắng cuối dòng, file kết thúc bằng newline. `.editorconfig` giúp editor tự áp cùng quy ước ngay khi gõ.

Nên chạy `npm run lint` trước khi commit để cả nhóm giữ đúng một kiểu code.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base URL của API. Giữ `/api` khi UI và API cùng origin (reverse proxy). Dùng URL tuyệt đối nếu API ở origin khác (backend phải bật CORS) |
| `VITE_API_TOKEN` | rỗng | Nếu có, mọi request gửi thêm `Authorization: Bearer <token>` |
| `VITE_UPLOAD_URL` | rỗng | Endpoint upload ảnh (multipart, field `file`). Rỗng = tắt chức năng Upload photos |

Mọi request đều gửi kèm cookie (`credentials: 'include'`), nên bạn có thể dùng session cookie thay cho token.

## Hợp đồng API

Base: `${VITE_API_BASE_URL}/bom`. Toàn bộ kiểu dữ liệu nằm trong `src/types.ts` — hãy dùng file đó làm nguồn sự thật khi viết backend.

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/bom/styles` | Danh sách style: mỗi phần tử có `seasons[]`, `latestSeason`, `sizeGroups[]` và các số tổng hợp (`units`, `orderValue`, `costValue`, `gpValue`, `gpPct`, `wip`) |
| GET | `/bom/styles/:code?season=` | Chi tiết một style + toàn bộ PO kèm BOM/labor/other cost/ size group qty |
| PATCH | `/bom/styles/:code/pos/:poNo?season=` | Cập nhật một phần PO (chỉ field có trong body), trả về PO sau khi tính lại |
| POST | `/bom/styles/photos` | Gán URL ảnh vào style theo `styleCode`, trả `{ bound, unmatched }` |

Quy ước quan trọng (UI dựa vào, sai là hỏng hiển thị):

1. **`season` là bắt buộc khi một `code` có nhiều season** — thiếu thì trả 400 kèm danh sách season hợp lệ.
2. **`latestSeason`** = season có `poDate` lớn nhất; UI chọn mặc định season này.
3. **`sizeGroups`** phải đã sắp xếp theo số ở cuối tên tăng dần (`NEXT-4` < `NEXT-5`; `COMMON-999` xuống cuối). UI lấy phần tử đầu làm nhóm mặc định, nên backend nên sort sẵn; nếu không, UI vẫn hiển thị đúng thứ tự bạn trả về nhưng nhóm mặc định có thể khác.
4. **Các field dẫn xuất do backend tính**: `materialTotal`, `otherTotal`, `unitCost`, `gp`, `gpPct`, `orderValue`, `costValue`, `gpValue`, và cấp style `avg*`. Frontend chỉ format, không tự tính lại.
5. **`laborCost`** = tổng `minutes × laborRate` của 4 công đoạn (hoặc giá trị `laborCost` lưu sẵn); `unitCost = materialTotal + laborCost + otherTotal`.
6. **`po.sizeGroups[].qty` cộng lại phải bằng `po.qty`**; khi PATCH đổi `qty`, backend phải phân bổ lại các nhóm (UI đọc lại từ response).
7. **Lỗi** trả `{ "error": { "code": "...", "message": "..." } }` (hoặc `{ "message": "..." }`); `message` được hiển thị nguyên văn trong toast/dialog.

`GET /bom/styles` cần trả cả `seasons` cho mọi style **trước khi** người dùng chọn gì, vì UI tự chọn style đầu tiên + season mới nhất + nhóm size nhỏ nhất và tải chi tiết ngay — không có màn hình trống.

## Upload ảnh

Nếu đặt `VITE_UPLOAD_URL`, dialog Upload photos sẽ:

1. `POST ${VITE_UPLOAD_URL}` dạng `multipart/form-data`, field `file`.
2. Đọc URL ảnh từ response: `url` / `downloadUrl` / `download_url` (hoặc chuỗi URL thuần).
3. Gọi `POST /bom/styles/photos` để gán ảnh vào style (khớp theo tên file, bỏ phần mở rộng).

Không đặt biến này thì dialog vẫn mở nhưng báo chưa cấu hình, không gửi request sai.

## Build & deploy

```bash
cd standalone
npm ci
npm run build        # typecheck + vite build → standalone/dist
```

`dist/` là static site: copy lên nginx / CDN / bất kỳ static hosting nào. Vì là SPA, cần fallback về `index.html`.

Mẫu nginx:

```nginx
server {
  listen 80;
  server_name po.example.com;
  root /var/www/po-cost-summary;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # UI và API cùng origin, không cần CORS
  location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Nếu API nằm ở origin khác, build với `VITE_API_BASE_URL=https://api.example.com/api` (Vite nhúng biến lúc build — đổi giá trị phải build lại) và bật CORS cho origin của UI.

## Khác biệt so với bản trên Miaoda

Đã bỏ các phụ thuộc nền tảng và thay bằng lớp adapter của bạn:

| Trước (Miaoda) | Bây giờ |
| --- | --- |
| `axiosForBackend` (tự gắn tenant, CSRF) | `src/lib/http.ts` — `fetch` + base URL + bearer token + cookie |
| `logger` của `@lark-apaas/client-toolkit` | `src/lib/logger.ts` |
| `dataloom.storage.uploadFile` + `getDefaultBucketId` | `src/lib/upload.ts` — endpoint upload của bạn |
| `resolveAppUrl('/openapi/bom')` | `${window.location.origin}${VITE_API_BASE_URL}/bom` |
| RLS / định danh người dùng của Miaoda | backend của bạn tự xác thực (token/cookie) |
| `/openapi` (API key) | `/api` — dùng đúng cơ chế auth của bạn |

Phần giao diện không đổi: `src/page/page.css` và `src/styles/theme.css` giữ nguyên token màu, typography, breakpoint 1180px / 760px.

## Tuỳ biến nhanh

- Màu / typography: `src/styles/theme.css` và các block `.po-*` trong `src/page/page.css`.
- Nhãn cột, thứ tự PO, cấu hình mặc định: `src/page/constants.ts`.
- Bố cục dashboard, meta strip, dialog: `src/page/components/`, `src/page/dialogs/`.
- Thêm/bớt field API: sửa `src/types.ts` rồi chạy `npm run build` để TypeScript chỉ ra chỗ cần cập nhật.

## Trạng thái kiểm chứng

- `tsc --noEmit` (strict) pass.
- `vite build` pass (chỉ cảnh báo bundle > 500 kB do ECharts).
- Mock API đã smoke test: `GET /bom/styles`, `GET /bom/styles/:code?season=`, `PATCH .../pos/:poNo` (bao gồm phân bổ lại size group khi đổi `qty`).
- Chưa chạy thử trong trình duyệt ở môi trường sandbox này; hãy `npm run dev` để xem giao diện thật.
