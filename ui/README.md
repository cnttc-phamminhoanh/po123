# PO123 UI

Giao diện React + Vite cho ứng dụng PO123. UI gọi API qua `/api`, mặc định dùng cùng origin với backend.

## Chạy local

Từ thư mục `ui/`:

```bash
npm install
npm run dev
```

Lệnh `npm run dev` dùng `dev.mjs` để chạy đồng thời:

- API thật ở `http://127.0.0.1:3001`.
- Vite ở `http://localhost:5174`.
- Vite chuyển `/api/...` xuống API `127.0.0.1:3001`.

Mở `http://localhost:5174`.

`dev.mjs` luôn chạy API ở `3001`, kể cả khi `api/.env` đang đặt `PORT=2405` cho production. Nếu API đã chạy sẵn ở nơi khác, chỉ chạy UI:

```bash
npm run dev:ui
```

## Build

```bash
npm run lint
npm run build
```

`npm run build` chạy TypeScript check rồi tạo static site trong `ui/dist`.

Production không dùng Vite dev server. Workflow build ra `ui/dist`, rồi Nginx phục vụ thư mục đó và chuyển `/api/...` xuống API local; xem [deploy/README.md](../deploy/README.md).

## Biến môi trường

Các biến `VITE_*` được nhúng lúc build, nên đổi giá trị phải build lại.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base URL của API. Giữ `/api` khi UI và API cùng origin qua proxy |
| `VITE_API_TOKEN` | rỗng | Nếu có, mọi request gửi thêm `Authorization: Bearer <token>` |

Mọi request dùng cookie (`credentials: 'include'`) để đăng nhập bằng session.

## API mà UI đang dùng

Base: `/api/bom`

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/styles` | Danh sách style kèm season và size group |
| GET | `/latest-style` | Style mới nhất |
| GET | `/styles/:code?season=&sizeGroup=` | Chi tiết style và 4 cột PO |
| GET | `/styles/:code/photo` | Ảnh của style |
| POST | `/styles/:code/photo` | Upload ảnh; cần đăng nhập; field `file` |
| PATCH | `/styles/:code/pos/:poNo` | Chưa mở — API trả `501` |

Base: `/api/auth`

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/login` | Đăng nhập, nhận cookie |
| GET | `/me` | Kiểm tra phiên |
| POST | `/logout` | Đăng xuất |
| GET/POST | `/users` | Quản lý tài khoản (admin) |
| PATCH | `/users/:id` | Đổi quyền / mật khẩu / trạng thái (admin) |
| GET | `/photo-history` | Lịch sử upload ảnh (admin) |

Kiểm tra API sống: `http://127.0.0.1:3001/health` — đây là route gốc, không nằm dưới `/api/bom`.

Lỗi API có dạng:

```json
{ "error": { "code": "...", "message": "..." } }
```

## Upload ảnh

`src/lib/upload.ts` gửi ảnh trực tiếp tới:

```text
POST /api/bom/styles/:code/photo
```

Body là `multipart/form-data`, field `file`. API lưu một ảnh cho mỗi style; upload ảnh mới sẽ thay ảnh cũ. Chức năng này cần đăng nhập.

## Cấu trúc chính

```text
ui/
├── index.html
├── vite.config.ts       # Vite 5174 + proxy /api → 127.0.0.1:3001
├── dev.mjs              # chạy API + Vite khi dev
├── src/
│   ├── main.tsx
│   ├── types.ts         # kiểu dữ liệu UI ↔ API
│   ├── lib/             # http, upload, logger
│   ├── ui/              # component cơ bản
│   ├── styles/          # theme
│   └── page/            # page, component, dialog, hook
└── dist/                # kết quả build
```

Luồng `npm run dev` và production đều dùng API thật.

## Ghi chú

- `ui/dist` không commit; workflow build lại mỗi lần deploy.
- Nếu UI và API khác origin, đặt `VITE_API_BASE_URL` thành URL đầy đủ và bật CORS ở API.
- Khi dùng HTTPS, API cần đặt `COOKIE_SECURE=true`.
