# Bản đồ nhận diện đất, nước và băng

`terrain-mask.json.gz` chứa hình học Natural Earth 1:10.000.000, được nén để không tải lại bản đồ mỗi lần phân tích. Tên tệp nguồn `10m` nghĩa là tỷ lệ 1:10 triệu, **không phải độ phân giải 10 mét**. Không gửi toàn bộ tệp xuống trình duyệt; `/api/location` và `/api/analyze` dùng cùng bộ phân loại ở server.

Nguồn công khai, public domain:

- [Đất liền và đảo](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/).
- [Hồ lớn](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/).
- [Vùng băng / sông băng](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-glaciated-areas/).
- [Điều khoản public domain](https://www.naturalearthdata.com/about/terms-of-use/).

Manifest bên trong tệp lưu URL tải, ngày tải và SHA-256 của từng GeoJSON đầu vào. Hình học giữ cả lỗ và đa đa giác; tọa độ làm tròn 6 chữ số thập phân, không làm tăng độ chính xác của bản đồ gốc.

Bản đồ đường bờ đã khái quát hóa; có thể bỏ sót đảo nhỏ hoặc làm lệch điểm sát bờ. Dải thận trọng 1 km phía ngoài đa giác đất là **chính sách ứng dụng**, không phải thông số độ chính xác của Natural Earth: trả `COASTAL_UNCERTAIN`, dừng chấm điểm và yêu cầu kiểm tra đường bờ, thay vì kết luận chắc là biển. Đa giác băng có thể bao gồm vùng đã mất băng; không dùng làm xác nhận tuyết hiện thời hoặc khẳng định toàn bộ dãy núi đều đóng băng. Núi ngoài đa giác vẫn được đánh giá bằng nhiệt độ NASA và độ cao SRTM trong luồng phân tích.

Cập nhật có chủ đích khi có mạng: `node src/validation/update-geodata.js`, sau đó chạy kiểm thử và khởi động lại server. Phân loại đất/nước/băng chạy offline; việc tải khí hậu NASA và SRTM vẫn cần mạng.
