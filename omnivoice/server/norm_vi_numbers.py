"""Đọc số tiếng Việt bằng Python thuần — thay vinorm trên máy không chạy được binary
Linux x86-64 của nó (macOS, Windows, Linux ARM).

Phủ: số nguyên (tới hàng triệu tỷ), số thập phân, số âm, khoảng "5-10", ngày tháng,
giờ phút, "thứ 2", số điện thoại/mã bắt đầu bằng 0, số La Mã sau "thế kỷ/khoá...",
và đơn vị đo/tiền tệ đứng ngay sau số.

Quy ước dấu phân cách (theo cách viết tiếng Việt):
  - "." với nhóm đúng 3 chữ số là phân cách hàng nghìn: 1.000.000, 1.500
  - "," là dấu thập phân: 1,5; trừ khi có nhiều nhóm 3 chữ số: 1,000,000
  - "." không theo nhóm 3 chữ số là dấu thập phân kiểu Anh: 78.4, 2.6
"""

import re

_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
_SCALES = ["", "nghìn", "triệu", "tỷ"]


def _read_triple(n: int, full: bool) -> str:
    """Đọc 0..999. full=True khi đứng sau nhóm lớn hơn (đọc cả "không trăm", "linh")."""
    hundreds, tens, units = n // 100, n // 10 % 10, n % 10
    words = []
    if hundreds or full:
        words += [_DIGITS[hundreds], "trăm"]
    if tens == 0:
        if units and words:
            words.append("linh")
    elif tens == 1:
        words.append("mười")
    else:
        words += [_DIGITS[tens], "mươi"]
    if units:
        if units == 1 and tens >= 2:
            words.append("mốt")
        elif units == 4 and tens >= 2:
            words.append("tư")
        elif units == 5 and tens >= 1:
            words.append("lăm")
        else:
            words.append(_DIGITS[units])
    return " ".join(words)


def read_int(n: int) -> str:
    """Đọc số nguyên: 21 → hai mươi mốt, 105 → một trăm linh năm,
    1005 → một nghìn không trăm linh năm, 10**12 → một nghìn tỷ."""
    if n < 0:
        return "âm " + read_int(-n)
    if n == 0:
        return "không"
    if n >= 10**9:
        # Trên tỷ, người Việt đọc "nghìn tỷ", "triệu tỷ": tách phần tỷ ra đọc đệ quy.
        high, low = divmod(n, 10**9)
        head = read_int(high) + " tỷ"
        if not low:
            return head
        return head + " " + _read_below_billion(low, full=True)
    return _read_below_billion(n, full=False)


def _read_below_billion(n: int, full: bool) -> str:
    groups = []
    while n:
        n, g = divmod(n, 1000)
        groups.append(g)
    words = []
    for i in range(len(groups) - 1, -1, -1):
        g = groups[i]
        if g == 0:
            continue
        leading = not words and not full
        words.append(_read_triple(g, full=not leading))
        if _SCALES[i]:
            words.append(_SCALES[i])
    return " ".join(words)


def read_digits(s: str) -> str:
    """Đọc từng chữ số: 0912 → không chín một hai."""
    return " ".join(_DIGITS[int(c)] for c in s)


def _read_decimal_part(s: str) -> str:
    # 3,5 → ba phẩy năm; 3,14 → ba phẩy mười bốn; 3,05 / 3,1415 → đọc từng chữ số
    if s.startswith("0") or len(s) > 2:
        return read_digits(s)
    return read_int(int(s))


def read_number(token: str) -> str:
    """Đọc một chuỗi số có thể chứa dấu . hoặc , theo quy ước ở đầu module."""
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", token):
        return read_int(int(token.replace(".", "")))
    if re.fullmatch(r"\d{1,3}(,\d{3}){2,}", token):
        return read_int(int(token.replace(",", "")))
    m = re.fullmatch(r"(\d+)[.,](\d+)", token)
    if m:
        return read_int(int(m.group(1))) + " phẩy " + _read_decimal_part(m.group(2))
    if re.fullmatch(r"\d+", token):
        if len(token) > 1 and token.startswith("0"):
            return read_digits(token)
        if len(token) > 15:
            return read_digits(token)
        return read_int(int(token))
    # Dạng khác (phiên bản 3.10.2, IP...): đọc từng khối, nối bằng "chấm"/"phẩy".
    parts = re.split(r"([.,])", token)
    out = []
    for p in parts:
        if p == ".":
            out.append("chấm")
        elif p == ",":
            out.append("phẩy")
        elif p:
            out.append(read_number(p))
    return " ".join(out)


# ── Đơn vị (cách đọc theo bảng của vinorm) ──────────────────────────────────
_UNITS = {
    "km/h": "ki lô mét trên giờ", "m/s": "mét trên giây",
    "m²": "mét vuông", "m2": "mét vuông", "km²": "ki lô mét vuông", "km2": "ki lô mét vuông",
    "m³": "mét khối", "m3": "mét khối", "cm²": "xăng ti mét vuông", "cm2": "xăng ti mét vuông",
    "°C": "độ xê", "°F": "độ ép", "°": "độ",
    "km": "ki lô mét", "cm": "xăng ti mét", "mm": "mi li mét", "nm": "na nô mét", "m": "mét",
    "kg": "ki lô gam", "mg": "mi li gam", "g": "gam", "tấn": "tấn",
    "ml": "mi li lít", "l": "lít", "ha": "héc ta",
    "kWh": "ki lô oát giờ", "kW": "ki lô oát", "W": "oát", "V": "vôn", "mAh": "mi li am pe giờ",
    "GHz": "ghi ga héc", "MHz": "mê ga héc", "Hz": "héc",
    "TB": "tê ra bai", "GB": "ghi ga bai", "MB": "mê ga bai", "KB": "ki lô bai", "kB": "ki lô bai",
    "ms": "mi li giây", "s": "giây",
    "tr": "triệu", "k": "nghìn",
    "đ": "đồng", "₫": "đồng", "vnđ": "đồng", "VNĐ": "đồng", "VND": "đồng", "vnd": "đồng",
    "USD": "đô la Mỹ", "usd": "đô la Mỹ", "EUR": "ơ rô", "€": "ơ rô", "£": "bảng", "¥": "yên",
}
_UNIT_RE = "|".join(re.escape(u) for u in sorted(_UNITS, key=len, reverse=True))

_NUM = r"\d+(?:[.,]\d+)*"
# Số không dính vào chữ cái/chữ số phía trước (tránh "H2O", "COVID19", "Q4").
_B = r"(?<![\w.,])"

_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def _roman_to_int(s: str) -> int:
    total = 0
    for a, b in zip(s, s[1:] + " "):
        v = _ROMAN[a]
        total += -v if b != " " and _ROMAN[b] > v else v
    return total


def _valid_date(d: int, m: int) -> bool:
    return 1 <= d <= 31 and 1 <= m <= 12


def normalize_numbers(text: str) -> str:
    """Thay mọi số trong text bằng chữ đọc được."""

    # Ngày đầy đủ: 12/05/2025, 12-05-2025, 12.05.2025
    def _date(m):
        d, mo, y = int(m.group(1)), int(m.group(3)), int(m.group(4))
        if not _valid_date(d, mo):
            return m.group(0)
        prefix = "" if re.search(r"ngày\s*$", m.string[:m.start()], re.I) else "ngày "
        return f"{prefix}{read_int(d)} tháng {read_int(mo)} năm {read_int(y)}"
    text = re.sub(_B + r"(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?!\d)", _date, text)

    # Tháng/năm: 05/2025 → tháng năm năm hai nghìn không trăm hai mươi lăm
    def _month_year(m):
        mo = int(m.group(1))
        if not 1 <= mo <= 12:
            return m.group(0)
        prefix = "" if re.search(r"tháng\s*$", m.string[:m.start()], re.I) else "tháng "
        return f"{prefix}{read_int(mo)} năm {read_int(int(m.group(2)))}"
    text = re.sub(_B + r"(\d{1,2})/(\d{4})(?!\d)", _month_year, text)

    # Ngày/tháng khi có chữ "ngày" đứng trước: ngày 2/9 → ngày hai tháng chín
    def _day_month(m):
        d, mo = int(m.group(2)), int(m.group(3))
        if not _valid_date(d, mo):
            return m.group(0)
        return f"{m.group(1)}{read_int(d)} tháng {read_int(mo)}"
    text = re.sub(r"(ngày\s+)(\d{1,2})[/-](\d{1,2})(?![\d/])", _day_month, text, flags=re.I)

    # Giờ: 14:30, 14:30:05, 14h30, 8h, 8g30
    def _time(m):
        h, mi, sec = int(m.group("h")), m.group("m"), m.groupdict().get("s")
        if h > 24 or (mi and int(mi) > 59):
            return m.group(0)
        out = f"{read_int(h)} giờ"
        if mi and int(mi):
            out += f" {read_int(int(mi))} phút"
        if sec and int(sec):
            out += f" {read_int(int(sec))} giây"
        return out
    text = re.sub(_B + r"(?P<h>\d{1,2}):(?P<m>\d{2})(?::(?P<s>\d{2}))?(?!\d)", _time, text)
    text = re.sub(_B + r"(?P<h>\d{1,2})[hg](?P<m>\d{2})?(?!\w)", _time, text)

    # Thứ tự: thứ 1 → thứ nhất, thứ 4 → thứ tư (các số khác đọc bình thường)
    text = re.sub(r"\b(thứ|hạng|lần thứ)\s+1(?!\d)", r"\1 nhất", text, flags=re.I)
    text = re.sub(r"\b(thứ|hạng|lần thứ)\s+4(?!\d)", r"\1 tư", text, flags=re.I)

    # Số La Mã sau các từ chỉ thứ tự: thế kỷ XXI, khoá IV, chương II
    text = re.sub(r"\b(thế kỷ|thế kỉ|khoá|khóa|chương|phần|quý|đại hội|kỳ|kì)\s+([IVXLCDM]+)\b",
                  lambda m: f"{m.group(1)} {read_int(_roman_to_int(m.group(2)))}", text, flags=re.I)

    # Khoảng: 5-10, 2020–2025 → năm đến mười
    text = re.sub(_B + rf"({_NUM})\s*[-–]\s*({_NUM})(?![\d])",
                  lambda m: f"{read_number(m.group(1))} đến {read_number(m.group(2))}", text)

    # Số âm: -5 ở đầu câu hoặc sau khoảng trắng / dấu mở ngoặc
    text = re.sub(rf"(?:(?<=^)|(?<=[\s(]))[-−]({_NUM})",
                  lambda m: "âm " + read_number(m.group(1)), text)

    # Số + đơn vị: 5km, 20 kg, 100.000đ, 30°C
    text = re.sub(_B + rf"({_NUM})\s?({_UNIT_RE})(?![\w²³])",
                  lambda m: f"{read_number(m.group(1))} {_UNITS[m.group(2)]}", text)

    # Còn lại: mọi số đứng riêng
    text = re.sub(_B + _NUM + r"(?![\d])", lambda m: read_number(m.group(0)), text)
    # Số dính chữ (Q4, H2O...) để nguyên cho model tự đọc.
    return text
