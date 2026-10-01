"""Lớp chuẩn hóa text tiếng Việt cho TTS (demo Phase 1).
- Shim `imp` (đã bị xóa ở Python 3.12) để vinorm 2.0.7 chạy được, KHÔNG sửa package.
- Từ điển phát âm cho acronym/thuật ngữ mà vinorm không biết.
- vinorm: số/ngày/đơn vị -> chữ đọc được.
"""
import sys, types, os, importlib.util, re

# --- shim imp.find_module để vinorm lấy được đường dẫn package ---
if "imp" not in sys.modules:
    _imp = types.ModuleType("imp")
    def _find_module(name, path=None):
        spec = importlib.util.find_spec(name)
        pkgdir = os.path.dirname(spec.origin)
        return (None, pkgdir, ("", "", 5))
    _imp.find_module = _find_module
    sys.modules["imp"] = _imp

from vinorm import TTSnorm  # noqa: E402

from omnivoice.server.norm_vi_numbers import normalize_numbers  # noqa: E402

# --- từ điển phát âm: acronym / thuật ngữ ngành (vinorm không biết) ---
# áp dụng TRƯỚC vinorm. Key so khớp nguyên từ (word boundary), không phân biệt hoa thường.
PRONUNCIATION = {
    "ZaloCRM": "Za-lô-Xi-A-Em",
    "Zalo OA": "Za-lô Âu-Ây",
    "OA": "Âu-Ây",
    "ZNS": "Dét-En-Ét",
    "ROI": "Rô-Ai",
    "CTR": "Xi-Ti-A",
    "KPI": "Kây-Pi-Ai",
    "SME": "Ét-Em-I",
    "F&B": "Ép-Bi",
    "edtech": "ép-tếch",
    "Mini App": "Mi-ni Áp",
    "Q4": "quý bốn",
    "Q1": "quý một", "Q2": "quý hai", "Q3": "quý ba",
    "messaging": "mess-si-jing",
    "first response": "phản hồi đầu tiên",
    "sales cycle": "chu kỳ bán hàng",
    "workflow": "quy trình",
    "pipeline": "pai-pờ-lai",
    "trigger": "tờ-ri-gơ",
    "benchmark": "ben-mác",
    "global": "gờ-lâu-bồ",
    "automation": "ô-tô-mây-shần",
    "sale": "seo",
    "sale rep": "seo-rép",
    "lead": "lít",
    "team": "tim",
    "copy": "cóp-pi",
    "task": "tát",
    "We Are Social": "Quy A Sâu-sồ",
    "Salesforce": "Seo-phọt",
    "HubSpot": "Háp-spót",
    "Decision Lab": "Đi-xi-zần Láp",
    "Connected Consumer": "Con-néc-tịt Con-su-mơ",
    "State of Sales": "Sờ-tây óp Seo",
    "Sales Trends": "Seo Tren",
    "Digital": "Đi-gi-tồ",
    "Vietnam": "Việt Nam",
    # --- bài Claude Audit Logs ---
    "Claude": "Clốt", "claude.ai": "clốt chấm ây-ai",
    "Shadow AI": "Sê-đâu Ây-Ai", "AI": "Ây-Ai",
    "GDPR": "Gi-Đi-Pi-A", "HIPAA": "Híp-pa",
    "SOC 2 Type II": "Sốc Hai Tai-hai", "SOC 2": "Sốc Hai", "SOC": "Sốc",
    "ISO 27001": "Ai-Ét-Ô hai bảy không không một", "ISO": "Ai-Ét-Ô",
    "API": "Ây-Pi-Ai", "SIEM": "Sim", "CSV": "Xi-Ét-Vi", "JSON": "Giây-sần",
    "IBM": "Ai-Bi-Em", "Kiteworks": "Kai-quợc", "EU AI Act": "Đạo luật Ây-Ai châu Âu",
    "EU": "châu Âu", "Article": "Điều", "Security Rule": "quy tắc bảo mật",
    "Anthropic": "An-thrô-pic", "Trust Center": "Trâst-Sen-tơ",
    "Admin Console": "Át-min Con-sô", "Audit Logs": "Âu-đít-Lốc",
    "audit logs": "âu-đít-lốc", "audit log": "âu-đít-lốc", "logs": "lốc",
    "Enterprise": "En-tơ-prai", "Compliance API": "com-plai-ần Ây-Pi-Ai",
    "compliance": "com-plai-ần", "regulators": "rê-ghiu-lây-tơ",
    "auditor": "ô-đi-tơ", "workspace": "quợc-spây", "metadata": "mê-ta-đa-ta",
    "Slack": "Sờ-lác", "conversation": "con-vơ-sây-shần", "prompt": "prom",
    "incident": "in-xi-đần", "visibility": "vi-zi-bi-li-ti", "extract": "ích-strác",
    "Settings": "Sét-ting", "Admin": "Át-min", "admin": "át-min",
    "ad-hoc": "át-hốc", "filter": "phin-tơ", "user": "diu-zơ",
    "high-risk": "hai-rít", "applications": "ứng dụng", "capabilities": "tính năng",
    "logging": "lốc-ging", "action type": "loại hành động", "time range": "khoảng thời gian",
    "scheduled export": "xuất theo lịch", "Type II": "Tai-hai", "Type I": "Tai-một",
    "email": "i-meo", "action": "ác-sần", "report": "rì-pọt", "bot": "bót",
    "API calls": "Ây-Pi-Ai côn", "pass": "pát",
}

def _apply_dict(text):
    """Thay nguyên từ, 1 lượt (không thay chồng). Acronym viết-hoa khớp đúng hoa
    (để 'AI' không ăn 'hai/ai/sai' tiếng Việt); từ thường khớp không phân biệt hoa thường."""
    keys = sorted(PRONUNCIATION, key=len, reverse=True)
    parts = [re.escape(k) if k.isupper() else f"(?i:{re.escape(k)})" for k in keys]
    pat = re.compile(r'(?<!\w)(?:' + "|".join(parts) + r')(?!\w)')
    def _repl(m):
        s = m.group(0)
        if s in PRONUNCIATION:
            return PRONUNCIATION[s]
        sl = s.lower()
        for k in keys:
            if k.lower() == sl:
                return PRONUNCIATION[k]
        return s
    return pat.sub(_repl, text)

def preclean(text):
    """Làm sạch ký hiệu đặc biệt trước khi chuẩn hóa."""
    text = re.sub(r'\[INTERNAL-LINK[^\]]*\]', ' ', text)      # bỏ marker biên tập
    text = text.replace('$670.000', '670 nghìn đô la')
    text = re.sub(r'\$\s?([\d.,]+)', r'\1 đô la', text)        # $ khác
    text = text.replace('§164.312(b)', 'mục một sáu bốn chấm ba một hai, khoản b')
    text = text.replace('→', ', ').replace('•', ' ')           # mũi tên/bullet -> nghỉ
    # '%' -> ' phần trăm' ngay tại đây: vinorm với rule=True đôi khi bỏ sót '%'
    # khi nó dính sát dấu câu (vd '85%.'). Xử lý trước cho chắc, số vẫn do vinorm đọc.
    text = re.sub(r'\s*%', ' phần trăm', text)
    return text

_vinorm_ok = True


def _vinorm(text):
    """vinorm chỉ kèm binary Linux x86-64; trên macOS/Windows/ARM nó không chạy được.
    Khi đó dùng bộ đọc số Python thuần (norm_vi_numbers) thay thế."""
    global _vinorm_ok
    if _vinorm_ok:
        try:
            return TTSnorm(text, punc=True, unknown=True, lower=False, rule=True)
        except OSError as e:
            _vinorm_ok = False
            import logging
            logging.getLogger(__name__).warning(
                "vinorm không chạy được trên máy này (%s) — dùng bộ đọc số Python.", e)
    # Mặc định để nguyên số cho model tự đọc (model đọc số tốt). VONIA_VI_NUMBERS=on
    # để bật bộ đọc số Python thay thế.
    if os.environ.get("VONIA_VI_NUMBERS", "off").strip().lower() in ("on", "1", "true", "yes"):
        return normalize_numbers(text)
    return text


def normalize(text):
    text = preclean(text)
    text = _apply_dict(text)
    out = _vinorm(text)
    out = re.sub(r'\s*\.\s*(?:\.\s*)+', '. ', out)  # gộp dấu chấm đôi
    return " ".join(out.split()).strip()

def _demo():
    samples = [
        "Zalo có 78.4 triệu người dùng, tăng 2.6 lần tính đến Q4 2025.",
        "Mười workflow giúp SME giảm 47 phần trăm chi phí ZNS, ROI dương 71 phần trăm, rút first response từ 14 phút xuống 30 giây.",
        "Zalo OA dẫn đầu CTR ngành messaging với 27 phần trăm trên benchmark global 18 phần trăm.",
    ]
    for s in samples:
        print("THÔ   :", s)
        print("CHUẨN :", normalize(s))
        print()


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(
        description="Chuẩn hóa text tiếng Việt (vinorm + từ điển phát âm) cho OmniVoice TTS."
    )
    ap.add_argument("text", nargs="?", help="Text cần chuẩn hóa. Bỏ trống thì đọc từ --in hoặc stdin.")
    ap.add_argument("--in", dest="inp", help="File text đầu vào.")
    ap.add_argument("--out", dest="out", help="File đầu ra (mặc định: in ra stdout).")
    ap.add_argument("--demo", action="store_true", help="Chạy self-test với các câu mẫu.")
    args = ap.parse_args()

    if args.demo or (args.text is None and not args.inp and sys.stdin.isatty()):
        _demo()
        sys.exit(0)

    if args.text is not None:
        raw = args.text
    elif args.inp:
        with open(args.inp, encoding="utf-8") as f:
            raw = f.read()
    else:
        raw = sys.stdin.read()

    # Chuẩn hóa theo từng dòng để giữ cấu trúc đoạn (OmniVoice chunk theo dấu câu).
    result = "\n".join(normalize(line) if line.strip() else "" for line in raw.splitlines())

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(result + "\n")
        print(f"Đã ghi text chuẩn hóa -> {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(result + "\n")
