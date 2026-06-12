# gstack Slash Commands Guide

Hướng dẫn sử dụng các slash commands gstack phổ biến cho OmniVoice project.

## Tổng quan

gstack là một complete engineering team trong slash commands — 50+ skills covering product thinking, architecture, code review, QA, security, và release automation.

---

## Slash Commands Chính

### 1. `/plan-eng-review` — Engineering Architecture Review

**Khi nào dùng:**
- Bạn có một plan/design và sắp bắt đầu code
- Bạn muốn review architecture của solution
- Bạn muốn kiểm tra data flow, edge cases, test coverage, performance trước khi code
- Bạn muốn "lock in the plan" trước khi invest thời gian implement

**Mục đích:**
- Review architecture, data flow, diagrams
- Kiểm tra edge cases, test coverage, performance
- Cung cấp opinionated recommendations
- Interactive walkthrough issues

**Timeline:**
```
Design/Plan → /plan-eng-review → Start coding
```

**Ví dụ:**
```bash
/plan-eng-review
# Dùng khi: "Tôi muốn thêm feature X. Plan là làm cách Y. Có vấn đề gì không?"
```

---

### 2. `/plan-design-review` — Design Methodology and Review

**Khi nào dùng:**
- Review thiết kế UI/UX
- Kiểm tra tính nhất quán visual
- Audit spacing, typography, color system
- Identify visual polish issues

**Mục đích:**
- Design quality gate
- Visual consistency checking
- Design system validation

---

### 3. `/plan-devex-review` — Developer Experience Audit

**Khi nào dùng:**
- Audit trải nghiệm của developers (DX)
- Kiểm tra CI/CD speed
- Review local dev setup
- Improve documentation for developers

**Mục đích:**
- Developer experience evaluation
- Identify DX bottlenecks
- Recommend DX improvements

---

### 4. `/review` — Code Review (Basic)

**Khi nào dùng:**
- Bạn vừa code xong, muốn check source code
- Kiểm tra nhanh bugs và style
- Sau khi implement, trước khi commit/push

**Mục đích:**
- Code review cơ bản
- Kiểm tra bugs, style violations
- Basic quality gate

**Ví dụ:**
```bash
/review
# Kiểm tra code hiện tại nhanh
```

---

### 5. `/code-review` — Code Review (Advanced)

**Khi nào dùng:**
- Deep code review với nhiều lựa chọn
- Muốn auto-fix suggestions
- Muốn post comments lên GitHub PR
- Cần comprehensive review (reusability, efficiency, simplification)

**Mục đích:**
- Advanced code review
- Correctness bugs + efficiency cleanups
- Auto-fix capabilities
- PR integration

**Effort Levels:**
- `low` — Quick, high-confidence findings only
- `medium` — Balanced coverage
- `high` — Broader coverage, may include uncertain findings
- `ultra` — Deep multi-agent review (cloud-based, tốn token hơn)

**Options:**
- `--fix` — Auto-apply suggestions to working tree
- `--comment` — Post findings as inline PR comments

**Ví dụ:**
```bash
/code-review                    # Default medium
/code-review --low              # Quick review
/code-review --high --fix       # Deep review + auto-fix
/code-review ultra --comment    # Deepest review + post to PR
```

---

## Comparison Table

| Command | Mục đích | Chi tiết | Auto-fix | PR Comments |
|---------|---------|---------|----------|------------|
| `/review` | Bugs + style | Cơ bản | ❌ | ❌ |
| `/code-review` | Bugs + reusability + efficiency | Nâng cao | ✅ | ✅ |
| `/plan-eng-review` | Architecture | Pre-coding | N/A | N/A |
| `/plan-design-review` | UI/UX design | Visual | N/A | N/A |
| `/plan-devex-review` | Developer experience | DX audit | N/A | N/A |

---

## Workflow Timeline

```
1. Product/Planning Phase
   └─ /office-hours (problem statement, explore alternatives)
   └─ /plan-ceo-review (strategic challenge)

2. Design Phase
   ├─ /design-consultation (design problem-solving)
   └─ /plan-design-review (design quality gate)

3. Architecture/Planning Phase
   ├─ /plan-eng-review (architecture review, lock in plan)
   └─ /plan-devex-review (developer experience audit)

4. Implementation Phase
   ├─ /autoplan (break down into steps)
   └─ Start coding

5. Code Review Phase
   ├─ /review (basic review)
   └─ /code-review [--level] [--fix/--comment] (advanced review)

6. QA/Testing Phase
   ├─ /qa (real-browser QA testing)
   └─ /qa-only (QA without staging)

7. Security Phase
   └─ /cso (security audit - OWASP + STRIDE)

8. Release Phase
   ├─ /ship (PR creation with narrative)
   └─ /land-and-deploy (coordinated release)
```

---

## Quick Decision Guide

**"Tôi sắp bắt đầu code"**
→ Đã có plan? Chạy `/plan-eng-review` trước

**"Tôi vừa code xong"**
→ Chạy `/review` (nhanh) hoặc `/code-review --medium` (chi tiết)

**"Tôi muốn deep review"**
→ `/code-review --high --fix` hoặc `/code-review ultra`

**"Tôi muốn post comments lên PR"**
→ `/code-review --medium --comment`

**"Tôi đang thiết kế UI"**
→ `/plan-design-review`

**"Tôi muốn check developer experience"**
→ `/plan-devex-review`

---

## Pro Tips

1. **Chạy `/plan-eng-review` TRƯỚC khi code** — Catch issues sớm, save thời gian
2. **Sử dụng `/code-review --fix`** — Auto-apply suggestions, sau đó review diff
3. **Sử dụng `--comment` cho PR reviews** — Post findings directly trên GitHub
4. **`/code-review ultra` cho critical code** — Deep multi-agent review (tốn token)
5. **Kết hợp `/review` + `/cso`** — Code quality + security audit

---

## Related Commands

- `/investigate` — Root cause debugging
- `/ship` — PR creation with narrative
- `/land-and-deploy` — Coordinated release
- `/cso` — Security audit (OWASP + STRIDE)
- `/qa` — Real-browser QA testing

---

**Last updated:** 2026-06-07
