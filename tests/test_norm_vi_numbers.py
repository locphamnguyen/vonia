import pytest

from omnivoice.server.norm_vi_numbers import normalize_numbers, read_int, read_number


@pytest.mark.parametrize("n, expected", [
    (0, "không"),
    (5, "năm"),
    (10, "mười"),
    (11, "mười một"),
    (14, "mười bốn"),
    (15, "mười lăm"),
    (20, "hai mươi"),
    (21, "hai mươi mốt"),
    (24, "hai mươi tư"),
    (25, "hai mươi lăm"),
    (100, "một trăm"),
    (101, "một trăm linh một"),
    (105, "một trăm linh năm"),
    (110, "một trăm mười"),
    (115, "một trăm mười lăm"),
    (1000, "một nghìn"),
    (1005, "một nghìn không trăm linh năm"),
    (1024, "một nghìn không trăm hai mươi tư"),
    (2025, "hai nghìn không trăm hai mươi lăm"),
    (10500, "mười nghìn năm trăm"),
    (1_000_001, "một triệu không trăm linh một"),
    (2_500_000, "hai triệu năm trăm nghìn"),
    (1_000_000_000, "một tỷ"),
    (1_000_000_000_000, "một nghìn tỷ"),
    (3_200_000_000_000, "ba nghìn hai trăm tỷ"),
    (5_000_000_021, "năm tỷ không trăm hai mươi mốt"),
    (-7, "âm bảy"),
])
def test_read_int(n, expected):
    assert read_int(n) == expected


@pytest.mark.parametrize("token, expected", [
    ("1.000.000", "một triệu"),
    ("1.500", "một nghìn năm trăm"),
    ("1,000,000", "một triệu"),
    ("1,5", "một phẩy năm"),
    ("78.4", "bảy mươi tám phẩy bốn"),
    ("3,14", "ba phẩy mười bốn"),
    ("3,05", "ba phẩy không năm"),
    ("0912345678", "không chín một hai ba bốn năm sáu bảy tám"),
    ("3.10.2", "ba chấm mười chấm hai"),
])
def test_read_number(token, expected):
    assert read_number(token) == expected


@pytest.mark.parametrize("text, expected", [
    ("Có 25 người.", "Có hai mươi lăm người."),
    ("Zalo có 78.4 triệu người dùng", "Zalo có bảy mươi tám phẩy bốn triệu người dùng"),
    ("Giá 100.000đ", "Giá một trăm nghìn đồng"),
    ("Chạy 5km mỗi ngày", "Chạy năm ki lô mét mỗi ngày"),
    ("Nặng 20 kg", "Nặng hai mươi ki lô gam"),
    ("Trời 30°C", "Trời ba mươi độ xê"),
    ("Hạn chót 12/05/2025.", "Hạn chót ngày mười hai tháng năm năm hai nghìn không trăm hai mươi lăm."),
    ("Vào ngày 02/09/1945", "Vào ngày hai tháng chín năm một nghìn chín trăm bốn mươi lăm"),
    ("Quốc khánh ngày 2/9", "Quốc khánh ngày hai tháng chín"),
    ("Báo cáo 05/2025", "Báo cáo tháng năm năm hai nghìn không trăm hai mươi lăm"),
    ("Họp lúc 14:30", "Họp lúc mười bốn giờ ba mươi phút"),
    ("Họp lúc 8h", "Họp lúc tám giờ"),
    ("Họp lúc 8h15", "Họp lúc tám giờ mười lăm phút"),
    ("Hẹn thứ 2 tuần sau", "Hẹn thứ hai tuần sau"),
    ("Đạt hạng 1", "Đạt hạng nhất"),
    ("Thứ 4 nghỉ", "Thứ tư nghỉ"),
    ("Thế kỷ XXI", "Thế kỷ hai mươi mốt"),
    ("Từ 5-10 phút", "Từ năm đến mười phút"),
    ("Nhiệt độ -5 độ", "Nhiệt độ âm năm độ"),
    ("Gọi 0912345678", "Gọi không chín một hai ba bốn năm sáu bảy tám"),
    ("Giữ nguyên H2O và Q4", "Giữ nguyên H2O và Q4"),
    ("Không có số nào", "Không có số nào"),
])
def test_normalize_numbers(text, expected):
    assert normalize_numbers(text) == expected
