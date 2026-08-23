# VietOCR - Trích Xuất Bảng Biểu & Xuất Excel

Ứng dụng OCR nhận diện và bóc tách bảng biểu tiếng Việt từ tài liệu PDF / Hình ảnh sang file Excel (.xlsx), hỗ trợ xử lý đơn tệp và hàng loạt (Bulk Mode).

---

## Hướng Dẫn Kích Hoạt GitHub Pages

Sau khi commit và push mã nguồn lên repository GitHub của bạn:

1. Mở repository trên **GitHub**.
2. Đi tới **Settings** (Cài đặt) > **Pages** (ở thanh menu bên trái).
3. Trong mục **Build and deployment** > **Source**, chọn:
   - **GitHub Actions**
4. Khi có commit mới lên nhánh `main` hoặc `master`, GitHub Actions sẽ tự động chạy workflow `.github/workflows/deploy.yml` để build và phát hành trang web lên GitHub Pages.
5. Truy cập địa chỉ trang web tại: `https://<tên-tài-khoản-github>.github.io/<tên-repository>/`

---

## Tính Năng Nổi Bật

- **Xử lý đơn tệp & Hàng loạt (Bulk Processing)**:
  - Tự động toàn phần (1-Click Auto Scan)
  - Bán tự động (Semi-Auto với kiểm tra cột từng file)
  - Thủ công (Manual)
- **Tùy biến cột linh hoạt**:
  - Hỗ trợ các mẫu bảng thông dụng (Hóa đơn GTGT, Bảng lương, Bảng điểm, Bảng kê xuất nhập kho, v.v.)
  - Tùy chỉnh tên cột, kiểu dữ liệu (Văn bản, Số lượng, Tiền tệ, Ngày tháng)
- **Bộ lọc & Chỉnh sửa trực quan**:
  - Tự động lọc trùng tiêu đề khi quét nhiều trang/nhiều tệp
  - Bảng chỉnh sửa trực tiếp dạng Bento Grid
- **Xuất dữ liệu**:
  - Xuất ra file Excel (.xlsx) chuẩn định dạng

---

## Chạy Ứng Dụng Ở Môi Trường Local

```bash
# Cài đặt các gói phụ thuộc
npm install

# Khởi chạy máy chủ phát triển
npm run dev

# Build ứng dụng cho môi trường production
npm run build
```
