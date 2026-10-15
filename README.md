# BLOUSE EXAM PRO V6.5 — GitHub → Vercel + Neon PostgreSQL

Bản nâng cấp **V6.5 Pro** bổ sung giao diện EdTech lớn với hình ảnh minh họa sống động, trình quản lý & sửa đề trực tiếp ngay trên Web cho tài khoản Admin, tải ảnh cho từng câu hỏi, hỗ trợ dạng **Trắc nghiệm 4 lựa chọn Đọc ngữ liệu (từ câu X đến câu Y)** và tính năng **🤖 AI OCR Nhập đề tự động từ file PDF / Ảnh / Text (kèm cơ chế AI tự động giải và gợi ý đáp án)**.

---

## 1. Các tính năng cốt lõi mới

### 🤖 AI OCR & Bóc tách đề thi tự động (Mới)
- Admin bấm **"🤖 Nhập đề bằng AI (OCR PDF / Ảnh)"** trong Admin Studio:
  - **Tải file PDF hoặc Ảnh đề thi**: Tự động nhận diện chữ, công thức Toán/Hóa/Sinh LaTeX (`$...$`), bảng biểu và sơ đồ.
  - **Dán trực tiếp văn bản đề thi**: Hỗ trợ copy-paste từ Word/PDF; hệ thống có sẵn **Trình phân tích cú pháp nội bộ** tự động bóc tách từng câu hỏi, 4 phương án A/B/C/D, Đúng/Sai, Ghép hợp và Trả lời ngắn hoàn toàn miễn phí.
  - **Công tắc "Cho phép AI tự giải và gợi ý đáp án"**:
    - **BẬT (Khuyên dùng)**: Nếu đề thi không có sẵn đáp án ở cuối, AI sẽ tự động phân tích, giải đề và điền đáp án gợi ý kèm lời giải chi tiết vào từng câu.
    - **TẮT**: AI chỉ bóc tách đề bài và các phương án A/B/C/D, để trống đáp án để Admin tự tích chọn theo ý mình.
  - **Google Gemini API Key**: Có thể cấu hình biến môi trường `GEMINI_API_KEY` trên Vercel hoặc nhập trực tiếp ngay trên giao diện web (được lưu an toàn vào trình duyệt Admin).

### 📖 Trắc nghiệm 4 lựa chọn dạng Đọc ngữ liệu (Từ câu X đến câu Y)
- Cho phép gắn đoạn văn bản / hình ảnh / giả thiết thí nghiệm dùng chung cho một cụm câu hỏi trắc nghiệm (ví dụ: *Từ Câu 10 đến Câu 12*, *Từ Câu 13 đến Câu 15*).
- Hiển thị khung **Đọc ngữ liệu** song song (có nút chuyển đổi **◫ Chia đôi màn hình** hoặc **▤ Trên - Dưới**) kèm thanh nút chuyển nhanh giữa các câu hỏi trong cùng cụm ngữ liệu.

### 📷 Tải ảnh cho từng câu hỏi & từng đoạn ngữ liệu
- Mỗi câu hỏi (và mỗi cụm ngữ liệu) đều có khung **📤 Tải ảnh từ máy** (hỗ trợ kéo thả hoặc **dán ảnh trực tiếp `Ctrl + V`**), tự động nén tối ưu và lưu thẳng vào cơ sở dữ liệu.
- Tích hợp **Lightbox phóng to ảnh** sắc nét khi học sinh làm bài hoặc xem lại bài.

### 🛠 Quản lý & Sửa đề trực tiếp trên Web (Không cần sửa JSON trên GitHub)
- Admin có thể tạo đề mới, nhập từ file `.json`, hoặc bấm **✏️ Sửa trực tiếp trên Web** ở bất kỳ đề nào để sửa câu hỏi, đáp án, hình ảnh, ngữ liệu và bấm **💾 Lưu đề trực tiếp lên Web** (lưu vào Neon PostgreSQL).

---

## 2. Deploy lên Vercel

1. Upload toàn bộ thư mục dự án lên GitHub và import vào Vercel.
2. Trong **Project Settings → Environment Variables**, cấu hình:
   ```text
   DATABASE_URL=connection string Neon PostgreSQL
   SESSION_SECRET=chuỗi bí mật ngẫu nhiên
   GEMINI_API_KEY=khóa API Gemini từ aistudio.google.com (Tùy chọn)
   ```
3. Redeploy. API tự động tạo các bảng `users`, `attempts`, và `exam_papers`.

---

## 3. Tài khoản Admin mặc định

```text
username: admin
password: Admin@123
```
Sau khi đăng nhập tài khoản `admin`, thanh điều hướng sẽ tự động xuất hiện nút **🛠 Quản lý & Sửa Đề** để bạn sử dụng toàn bộ tính năng Admin Studio và AI OCR.
