# ☕ Cô Ba Cafe & Trà Sữa - Hệ Thống Đặt Nước & Quản Lý Sổ Nợ Nội Bộ Công Ty

Ứng dụng web đặt nước và theo dõi sổ nợ đồ uống nội bộ cho nhân viên văn phòng, hoạt động qua mạng LAN (Wi-Fi công ty) mà không cần internet hay cơ sở dữ liệu phức tạp.

---

## 🌟 Tính Năng Nổi Bật

### 1. Dành cho Nhân viên (`Menu_DatNuoc_NhanVien.html`)
- **Quét mã QR / Truy cập qua link Wi-Fi LAN** để đặt nước nhanh chóng từ điện thoại hoặc máy tính.
- **Menu chuẩn Cô Ba Cafe** với đầy đủ các danh mục: Cà phê, Cacao, Milo, Trà Sữa, Trà Trái Cây, Yaourt, Nước Ép & Sinh Tố.
- Tự do chọn mức đường, đá, topping và ghi chú riêng cho từng ly.
- **Món quen thuộc:** Tự động gợi ý gu uống riêng cho từng bạn.
- Bấm đặt hàng và nhận thông báo xác nhận ngay lập tức.

### 2. Dành cho Quản lý / Thu tiền (`App_DatNuoc_TinhTien_CongTy.html`)
- **Bảng ma trận sổ nợ trực quan:** Theo dõi chi tiết từng ngày trong tháng của từng thành viên.
- **Hỗ trợ 2 chế độ xem chu kỳ:**
  - *Tháng Lịch chuẩn (1 - 31).*
  - *Chu kỳ nhận lương (Ngày 10 hàng tháng nhận lương: gom từ ngày 11 tháng trước đến ngày 10 tháng sau).*
- **Âm thanh Ting Ting:** Chuông báo phát ra ngay khi có người vừa đặt món mới qua mạng LAN.
- **Tích hợp mã VietQR:** Tạo nhanh mã QR thanh toán ngân hàng (MB Bank) kèm số tiền chính xác theo từng bạn.
- **Khóa an toàn dữ liệu:** Chống mất mát dữ liệu sổ nợ, bảo vệ lịch sử đặt món của tất cả các ngày.

### 3. Máy chủ mạng LAN (`server.js`)
- Viết bằng Node.js thuần (Zero dependencies - không cần `npm install`).
- Tự động dò tìm IP mạng LAN và sinh mã QR kèm link nội bộ cho nhân viên truy cập.
- Đồng bộ đơn hàng thời gian thực qua cơ chế Polling nhẹ nhàng.

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Khởi chạy 1-Click (Khuyên dùng trên Windows)
1. Nhấp đúp vào file **`Chay_App_Dat_Nuoc.bat`**.
2. Cửa sổ dòng lệnh sẽ tự động khởi động máy chủ và hiển thị:
   - Link trang quản trị: `http://localhost:8080/admin`
   - Link nhân viên đặt món: `http://<IP_LAN>:8080`
   - Mã QR để nhân viên quét bằng camera điện thoại.

### Cách 2: Chạy thủ công bằng dòng lệnh
Yêu cầu đã cài đặt **Node.js** trên máy:
```bash
node server.js
```

---

## 📁 Cấu Trúc Mã Nguồn

```text
coba-cafe-app/
├── App_DatNuoc_TinhTien_CongTy.html  # Giao diện Quản trị viên & Sổ nợ
├── Menu_DatNuoc_NhanVien.html        # Giao diện Nhân viên đặt nước
├── server.js                         # Máy chủ HTTP & API đồng bộ LAN
├── data_app.json                     # Cơ sở dữ liệu JSON (Menu, Thành viên, Sổ nợ)
├── Chay_App_Dat_Nuoc.bat             # Script khởi chạy tự động
├── README.md                         # Hướng dẫn sử dụng
└── .gitignore                        # File loại trừ Git
```

---

## 🛠️ Công Nghệ Sử Dụng
- **Frontend:** HTML5, Modern CSS (Flexbox/Grid, Dark/Light Themes), JavaScript (ES6+), FontAwesome Icons, Web Audio API.
- **Backend:** Node.js HTTP Module (Native).
- **Lưu trữ:** File JSON cục bộ kết hợp Browser LocalStorage dự phòng.
