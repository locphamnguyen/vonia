# Kiểm kê tính năng ZCRM Mobile (ZaloCRM-App) — đầu vào kịch bản video

- Repo: `/Users/martin/0project/locnguyendata/repos/ZaloCRM-App`, nhánh `develop`, HEAD `2b58afcc` (29/09/2026). Chỉ đọc.
- Ngày kiểm: 30/09/2026. Đường dẫn dưới đây tính từ `src/`. Câu chữ UI ghi nguyên văn (khoá i18n trong `i18n/vi.json` hoặc chuỗi cứng trong component).
- Cột "Video" = chương đưa vào video (số chương) hoặc lý do bỏ.

## Token dùng trong video
| Token | Giá trị | Nguồn |
|---|---|---|
| header / thương hiệu | `#1786BE` | `theme/colors/brand.ts` → `header` |
| nền trang / thẻ | `#F2F4F5` / `#FFFFFF` | `brand.page`, `brand.card` |
| navy logo, avatar không ảnh | `#0E445A` | `brand['avatar-fallback']` |
| nền khung chat | `#E2E9F1` | `brand['chat-canvas']` |
| chữ phụ trên header | `hsla(0,0%,100%,.78)` | `brand['header-text-muted']` |
| chữ/icon xám phụ | `#7B858D` | `theme/colors/light.ts` gray 700/800 |
| bong bóng gửi | nền `#D0F0FE`, viền `#0D8AFD` | `chat-screen/components/message-item/Message.tsx` |
| thanh chọn nhiều | Lưu `#39A9D6`, Chia sẻ `#4C9BEA`, Thu hồi `#E07A2F`, Xoá `#D93F3F` | `message-selection/MessageSelectionBar.tsx` |
| KPI Tổng quan | Chưa rep `#E13D45`, Hẹn hôm nay `#1786BE`, Đang theo dõi `#0F766E`, KH đình trệ `#B45309`, Chốt tháng `#16A34A` | `screens/dashboard/DashboardMePanel.tsx` |
| nhãn tên NV | chữ `#3D5A6C`; tự động `#9A4A06`; AI `#6D28D9` | `message-item/OutboundSenderLabel.tsx` |
| bảng màu tag | `#D91B1B #0068FF #FF6905 #4BC377 #FAC000 #F31BC8 #6F3FCF #FF6B6B` + mặc định `#90A4AE` | `constants/tagColors.ts` |
| font | Inter 400/420/500/580/600 | `assets/fonts/Inter-*.ttf` |

## Giới hạn thật (chỉ nêu khi khớp)
| Giới hạn | Giá trị | Nguồn |
|---|---|---|
| Nhóm tối đa / lần chia sẻ | 100 | `utils/shareSelection.ts` `SHARE_MAX_GROUPS` |
| Nhóm / nick / ngày | 10 | `screens/chat-screen/components/message-components/share-sheet/shareTargets.ts` `GROUP_DAY_CAP` |
| Tin 1-1 / nick / ngày | 200 (có lời nhắn tính 2) | cùng file, `DM_DAY_CAP`, `estimateShareDays` |
| Tin chia sẻ một lượt (chọn nhiều) | 19 | cùng file, `MULTI_SHARE_MAX` |
| Tin chọn tối đa (thanh chọn nhiều) | 30 → "Đã chọn N/30" | `message-selection/messageSelection.ts` `MAX_BATCH_SAVE` |
| Gửi hàng loạt từ tab hội thoại | app không tự chặn số người nhận; máy chủ quyết nhịp | `screens/bulk-send/BulkSendRecipientsScreen.tsx` (chú thích) |

## Tính năng theo khu vực

### A. Đăng nhập & kết nối kênh
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Đăng nhập email/mật khẩu, SSO, đổi URL máy chủ | `LOGIN.TITLE` "Đăng nhập tài khoản", `LOGIN.LOGIN_VIA_SSO`, `CONFIGURE_URL.DESCRIPTION` "…dùng go.zopen.vn." | `screens/auth/*`, `i18n/vi.json` | bỏ (màn kỹ thuật, không phải giá trị bán hàng) |
| Kết nối nick Zalo mới từ Tổng quan: nút "+ Kết nối kênh" mở sheet 4 bước | "Kết nối nick Zalo mới"; bước "Nhập SĐT · Xác nhận · Quét QR · Hoàn tất"; "Mở app Zalo trên điện thoại", "Cài đặt → Quản lý thiết bị → Quét QR", "Đợi xác thực hoàn tất"; "Kết nối thành công!" | `screens/dashboard/ActionHubScreen.tsx`, `ConnectChannelLauncher.tsx`, `screens/settings/zalo-accounts/ZaloConnectChannelSheet.tsx` | Ch.1 |
| Quản lý kênh chat (đổi tên từ "Quản lý nick Zalo") | "Quản lý kênh chat"; "Đang hoạt động"/"Mất kết nối"; "Đang đồng bộ danh bạ…", "Đang đồng bộ lịch sử chat…" | `screens/settings/SettingsScreen.tsx:199`, `screens/settings/zalo-accounts/ZaloAccountsScreen.tsx` | Ch.19 |

### B. Tổng quan
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Tab đầu "Tổng quan", 6 KPI 2×3 + chỉ số tương tác | "📈 CÁC CHỈ SỐ": "Chưa rep"/"Cần trả lời", "Hẹn hôm nay"/"Lịch của bạn", "Đang theo dõi", "KH của tôi", "KH đình trệ"/">7 ngày", "Chốt tháng"; "Đã gửi · Đã rep · Tỉ lệ rep · KH mới"; "🔥 CẦN REP GẤP", "📅 LỊCH HẸN HÔM NAY", "✉️ LƯU LƯỢNG TIN NHẮN (30 NGÀY)" | `screens/dashboard/DashboardMePanel.tsx`, `ActionHubScreen.tsx` | Ch.2 |
| Tab vai trò | "Việc của tôi · Quản lý team · Quản lý hệ thống" | `ActionHubScreen.tsx` | Ch.2 (hiện dải tab) |
| Tự cập nhật số liệu khi quay lại màn | (hành vi) | commit `b8d36554` | Ch.2 (lời thoại) |

### C. Hộp thư & danh sách hội thoại
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Gộp mọi nick, chọn phạm vi nick | "Toàn bộ nick ▾", "N online · M offline", "Phạm vi xem — chọn nick" | `screens/conversations/components/conversation-header/NickScopeSelector.tsx` | Ch.3 |
| 4 tab lọc | "Cá nhân · Nhóm · Chính · Ưu tiên" | `conversation-tabs/tabOrder.ts`, `ConversationTabStrip.tsx` | Ch.3 |
| Chấm đỏ cạnh tab có tin chưa đọc | a11y "Có tin nhắn chưa đọc" | `ConversationTabStrip.tsx`, `conversation-tabs/tabUnread.ts` | Ch.3 |
| Bấm giữ tab rồi kéo đổi thứ tự (tab đầu mở sẵn) | a11y "Bấm giữ rồi kéo ngang để đổi thứ tự tab" | `ConversationTabStrip.tsx`, `tabOrder.ts`; commit `72af744c` | Ch.3 |
| Quẹt hàng: Trạng thái / Gọi / Ghim / Thêm; quẹt kia: Chưa đọc | `CONVERSATION.ITEM.*` "Trạng thái", "Gọi", "Ghim", "Thêm", "Chưa đọc" | `conversation-item/ConversationItemContainer.tsx` | Ch.4 |
| Ghim hội thoại, đinh ghim cạnh giờ | `CONVERSATION.MORE.PIN_OK` "Đã ghim hội thoại" | `conversation-item/ConversationItemDetail.tsx` | Ch.4 |
| Bộ lọc (drawer phải): Trạng thái đọc, Tag (mỗi tag một hàng, OR/AND), Tag Zalo, Quan hệ Zalo, Tag CRM, Trạng thái trả lời, Chăm sóc; chân "Bỏ lọc" / "Lọc (n)" | "Bộ lọc"; "Quan hệ Zalo": "Bạn bè · Chờ kết bạn · Người lạ đang chat · Ghost" | `components-next/filter-drawer/*`, `conversation-filters/chatFilterDrawerConfig.ts` | Ch.5 |
| Chọn nhiều hội thoại → gắn Tag Zalo/Tag CRM, chuyển tab | `CONVERSATION.BULK_LABELS.TAB_ZALO/TAB_CRM`, `CRM_TAGS.CREATE_TAG` "+ Tạo tag "{{name}}" và gắn cho cả lô", `CRM_TAGS.BULK_OK`, `TAB.BULK_OK` | `conversation-actions/bulk-labels/*` | Ch.6 |
| Tạo/sửa/xoá tag CRM có chọn màu; sửa thẻ Zalo (nhấn giữ) | `TAG_EDITOR.*`: "Tạo tag", "Tên tag", "Khách VIP", "Màu", "Xem trước", "Huỷ", "Tạo tag", "Xoá tag này", "Đã tạo tag “{{name}}”…" | `bulk-labels/TagEditorSheet.tsx`, `constants/tagColors.ts`; commit `cd306035` | Ch.6 |
| Tìm kiếm (khách, hội thoại, tin nhắn) | `SEARCH.*` "Nhập từ 2 ký tự trở lên để tìm", "Khách hàng · Hội thoại · Tin nhắn" | `screens/search/*` | gộp (chỉ icon kính lúp ở Ch.3) |

### D. Hội thoại & soạn tin
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Trợ lý AI: bấm icon lấp lánh → gợi ý chèn vào ô soạn để sửa/gửi (có hỏi đồng ý dùng AI) | lỗi: "AI chưa có gợi ý"; sheet đồng ý "Dùng AI cần gửi dữ liệu ra ngoài" | `reply-box/AiSuggestButton.tsx`, `components-next/ai-consent/AiConsentSheet.tsx` | Ch.7 |
| Thêm ảnh: sheet 3 nguồn | "Kho Ảnh", "Ảnh & video · từ máy", "Tệp · từ máy" | `reply-box/zalo-composer/MediaSourceSheet.tsx` | Ch.8 |
| Album xếp khảm 2-2-2-3 | (bố cục) | `message-components/albumLayout.ts`, `AlbumBubble.tsx` | Ch.8 |
| Ghi âm, khối tin (BlockPicker) trong ô soạn | — | `reply-box/ReplyBoxContainer.tsx`, `audio-recorder/AudioRecorder.tsx`, `reply-box/BlockPicker.tsx` | gộp (icon trên thanh soạn) |
| Thả cảm xúc: nút tròn dưới bong bóng, 6 cảm xúc, rung nhẹ | ❤️ 👍 😆 😮 😢 😠 | `message-components/ReactionPicker.tsx`, `MessageReactions.tsx`; commits `739ad0e1`, `b4ca40df` | Ch.9 |
| Gạt để trả lời (ngưỡng 56px, có rung) | `LONG_PRESS_ACTIONS.REPLY` "Trả lời" | `message-item/swipeToReply.ts`; commit `0b48fb48` | Ch.9 |
| Bấm giữ tin: menu | "Trả lời · Chuyển tiếp · Thu hồi · Sao Chép · Nhắc hẹn · Lưu ảnh · Chọn nhiều · Tạo khối tin nhắn · Xoá tin nhắn" | `message-menu/buildMessageMenu.ts`, `message-item/Message.tsx` | Ch.10 |
| Chọn nhiều tin → Lưu vào Kho / Chia sẻ / Thu hồi / Xoá | "Đã chọn N/30", "Huỷ", "Lưu vào Kho", "Chia sẻ", "Thu hồi", "Xoá" | `message-selection/MessageSelectionBar.tsx` | Ch.10 |
| Dịch tin nhắn | — | đã gỡ (`buildMessageMenu.ts`: "server không có route dịch") | **bỏ** — không còn trong app |
| Tên nhân viên trên cụm tin gửi đi | tên NV + chấm viết tắt | `message-item/OutboundSenderLabel.tsx`; commit `55e00e8d` | Ch.14 |
| Bấm avatar thành viên trong nhóm | "Kết bạn", "Nhắn tin riêng", "Xoá khỏi nhóm" (cộng đồng: "Xoá khỏi cộng đồng") | `group-member/GroupMemberSheet.tsx`, `groupMemberActions.ts` | Ch.14 |
| Kết bạn từ header hội thoại, thu hồi/đồng ý/từ chối lời mời | "+ Kết bạn", "⏳ Đã mời", "Lời nhắn kèm lời mời kết bạn", "Lời mời sẽ hiện trong Zalo của khách.", "Đã gửi lời mời kết bạn" | `chat-header/ChatHeaderZaloInfo.tsx`, `FriendInviteSheet.tsx`, `ChatHeader.tsx` | Ch.15 |
| Huỷ kết bạn (menu 3 gạch, mục đỏ) | `CUSTOMER_MENU.UNFRIEND` "Huỷ kết bạn", `UNFRIEND_OK` | `chat-header/*`, `i18n/vi.json` | Ch.15 |
| Menu khách: Thông tin, Ghi chú, Hẹn gọi nhắc nhở, Lịch sử, Bám đuổi, Ảnh/Video/File, Gắn thẻ, Chặn, Báo cáo spam | `CONVERSATION.CUSTOMER_MENU.*` | `i18n/vi.json`, `chat-header/*` | Ch.15 (hiện menu) |

### E. Chia sẻ & gửi hàng loạt
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Sheet Chia sẻ: tab Gần đây/Nhóm/Bạn bè/App khác, Tags, Chọn tất cả, lời nhắn, ước tính ngày | `SHARE.*`: "Chia sẻ", "Tags (n)", "Chọn tất cả (N)", "{{people}} người · {{groups}} nhóm · dự kiến {{days}} ngày", `VARIABLE_WARNING`, `PLAN_TOO_MANY_GROUPS` "Tối đa {{max}} nhóm cho một lần chia sẻ", `SCHEDULED` "Đã lên lịch gửi …" | `message-components/share-sheet/*`, `utils/shareSelection.ts` | Ch.11 |
| Chia sẻ nhiều tin một lượt (≤19) | — | `shareTargets.ts` `MULTI_SHARE_MAX`; commit `73ff5005` | Ch.11 |
| Tiến độ chia sẻ | `SHARE.PROGRESS.*`: "Tiến độ chia sẻ", "Đã gửi x/y", "Còn lại n", "Lỗi n", "Đang chờ quota hoặc giờ gửi — tiếp tục lúc {{time}}", "Dừng/Tiếp tục/Huỷ"; `FAILED_LIST.TITLE` "Người nhận lỗi (n)" + lý do | `components-next/share-progress/ShareProgressSheet.tsx` | Ch.12 |
| Gửi tin nhắn hàng loạt từ tab hội thoại: nút + → "Gửi tin nhắn hàng loạt" → "Soạn nội dung" (biến {gender} {name}…) → "Tiếp tục" → "Chọn người nhận" (Bạn bè · Nhóm, Tags) → "Gửi"; Khối tạm tự lưu trữ | "Soạn một nội dung, gửi tới nhiều khách hoặc nhóm"; "Đã xếp hàng gửi. Theo dõi tiến độ ở thanh dưới." | `components-next/bulk-send/BulkSendFab.tsx`, `screens/block-editor/BlockEditorScreen.tsx`, `screens/bulk-send/BulkSendRecipientsScreen.tsx`, `services/zalocrm/share-broadcast.ts` | Ch.13 |
| Biến cá nhân hoá | `{gender}` "Giới tính (Anh/Chị)", `{name}` "Tên khách", `{sale}`… | `constants/templateVariables.ts` | Ch.13 |

### F. Bám đuổi
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Gắn luồng thủ công 2 bước | "Bám đuổi thủ công", `STEP_1` "Bước 1/2 · Chọn 1 kịch bản có sẵn…", `STEP_2` "Bước 2/2 · Ghi lý do…", "Lý do bám đuổi *", "Xác nhận bắt đầu", "Đã gắn khách vào luồng bám đuổi"; cảnh báo trùng tin | `screens/follow-up/AddFollowUpFlowScreen.tsx` | Ch.16 |
| Thẻ luồng: Đang chạy/Tạm dừng/Xong, Lần gửi tiếp, Gửi bước tiếp ngay, Tạm dừng 24h, Dừng hẳn; theo dõi khách | `FOLLOW_UP.*` | `screens/follow-up/FollowUpScreen.tsx`, `components/FollowUpFlowCard.tsx` | Ch.16 |
| Tự dừng khi khách trả lời | app chỉ HIỂN THỊ trạng thái máy chủ ("Khách vừa trả lời — tạm dừng, tự chạy lại khi hết giờ", `followUpCards.ts`), không có logic ở app | `screens/follow-up/followUpCards.ts` | **không quảng cáo** (do máy chủ quyết, chưa xác minh) |

### G. Khách hàng, lịch hẹn, kho media, cài đặt
| Tính năng | Câu chữ UI | Nguồn | Video |
|---|---|---|---|
| Hồ sơ khách: điểm Lead/Ưu tiên/Tương tác, Trạng thái khách hàng, tag CRM + thẻ Zalo, Ghi chú, Lịch hẹn, Sale đang chăm, nút Gọi/Nhắn tin | "Lead", "Ưu tiên", "Tương tác", "Trạng thái khách hàng", "Ghi chú", "＋ Thêm", "Lịch hẹn", "Sale đang chăm" | `screens/contact-details/*` | Ch.17 |
| Lịch sử khách hàng (Quảng cáo / Nguồn) | `CUSTOMER_HISTORY.*` | `screens/customer-history/CustomerHistoryScreen.tsx` | gộp lời thoại Ch.17 (không dựng màn) |
| Tab Khách hàng: xếp theo điểm lead, tìm, khách trùng lặp, gợi ý gộp KH Cha | "🔍 Tìm tên / số điện thoại…", "🔍 Khách trùng lặp", "🧩 Gợi ý gộp KH Cha" | `screens/customers/CustomersScreen.tsx` | bỏ (giữ video gọn; chưa dựng) |
| Tab Lịch hẹn: Hôm nay / Sắp tới, nút tạo | "Lịch hẹn", "Hôm nay", "Sắp tới", "Tạo nhắc hẹn" | `screens/appointments/AppointmentsScreen.tsx` | Ch.17 |
| Kho media: Kho/Thùng rác, lọc Tất cả/Ảnh/Video/Tệp, Công khai/Riêng tư, Yêu thích, Tải lên | "Kho media", "+ Tải lên", "❤️ Yêu thích", "🗑 Thùng rác", "Tìm theo tên…" | `screens/media/MediaLibraryScreen.tsx` | Ch.18 |
| Thông báo theo nick | `NOTIFICATION_PREFERENCE.PER_CHANNEL_HINT` "Chọn nick bạn muốn nhận thông báo tin nhắn mới." | `screens/settings/*` | Ch.19 |
| Nhắc cập nhật + bản vá OTA | `APP_UPDATE.TITLE` "Đã có phiên bản mới", `OTA_TITLE` "Đã tải xong bản vá", `OTA_RELOAD` "Khởi động lại", "Để sau" | `components-next/app-update/UpdateGate.tsx` | Ch.19 |
| Tên miền | pháp lý `https://zopen.vn/vi/...`, máy chủ mặc định `go.zopen.vn` | `constants/index.ts`, `i18n` `CONFIGURE_URL.DESCRIPTION`; commit `c48523c2` | CTA "zopen.vn" |

## Không đưa vào video
- Dịch tin nhắn (đã gỡ khỏi app).
- "Bám đuổi tự dừng khi khách trả lời" (máy chủ quyết; app chỉ hiện trạng thái).
- Menu Copilot (Viết lại/Đổi giọng văn…): khoá `COPILOT.*` còn trong code nhưng luồng người dùng hiện tại là nút gợi ý một chạm (theo ghi chú skill: không có menu).
- Tab Khách hàng (danh sách, khách trùng lặp), đăng nhập/SSO/đổi URL, SLA, macro (khoá cũ từ Chatwoot) — không dựng để giữ độ dài.
- Không có hotline, giá, "miễn phí" trong code/docs → CTA chỉ ghi tên miền.

## Dữ liệu mẫu
Mọi tên khách, tên nhóm, tên nick, tên nhân viên, nội dung tin, số liệu KPI, số người nhận trong video là DỮ LIỆU MẪU do người dựng đặt; chỉ nhãn giao diện, màu và giới hạn là lấy từ code.
