# MY EXAM WEB V5 — GitHub → Vercel

Bản này đã đổi backend local JSON sang **Vercel Function + Neon PostgreSQL** để deploy online. Frontend và API cùng domain nên không còn lỗi 405 do Live Server.

## 1. Deploy

1. Upload toàn bộ thư mục này lên GitHub.
2. Import repository vào Vercel.
3. Vercel sẽ nhận `api/[...path].js` là serverless API.
4. Vào **Project Settings → Environment Variables** và tạo:

```text
DATABASE_URL=connection string Neon PostgreSQL
SESSION_SECRET=một chuỗi bí mật dài và ngẫu nhiên
```

5. Redeploy.

## 2. Database

Có thể dùng Neon PostgreSQL. API tự tạo bảng `users` và `attempts` ở lần gọi đầu tiên; cũng có file `database/schema.sql` nếu muốn chạy thủ công.

## 3. Admin lần đầu

API tự tạo:

```text
username: admin
password: Admin@123
```

Nếu database đã có `admin`, API không ghi đè tài khoản đó.

Sau khi đăng nhập, dùng nút ⚙ để cấp tài khoản học sinh và khóa/mở tài khoản.

## 4. Thống kê

Mỗi tài khoản có dữ liệu riêng:
- Lịch sử làm bài
- Điểm cao nhất VSAT
- Điểm trung bình VSAT
- Điểm cao nhất THPTQG
- Điểm trung bình THPTQG
- Lần thi gần nhất / số lần thi

Dữ liệu nằm trong PostgreSQL, không nằm trong filesystem của Vercel.

## 5. Chạy local

Cần Node.js 18+ và Vercel CLI.

```bash
npm install
npx vercel dev
```

Sau đó mở URL Vercel CLI in ra. Cần đặt `DATABASE_URL` và `SESSION_SECRET` trong `.env.local` khi chạy local.

## 6. Ngân hàng câu hỏi

Giữ nguyên cấu trúc `database/<exam>/<subject>/manifest.json` và JSON câu hỏi hiện có. Không tạo câu hỏi demo khi thiếu dữ liệu.

## 7. Thời gian

- Toán: 90 phút
- Ngữ văn: 90 phút
- Môn khác: 50 phút

## 8. Lưu ý bảo mật

Mật khẩu được hash bằng Node `scrypt`; cookie đăng nhập là HttpOnly + Secure + SameSite=Lax. Điểm vẫn được frontend tính và gửi lên API để lưu; bản này chưa phải hệ thống chống gian lận/thi chính thức. Nếu cần chống sửa điểm từ client, bước tiếp theo là chuyển toàn bộ engine chấm điểm sang server.
