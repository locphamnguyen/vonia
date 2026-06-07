/* ============================================================
   VONIA — data: voices, languages, modes, models, i18n
   ============================================================ */

// ---- Voice library (star-named like the original) ----
const VOICE_AVATAR_COLORS = [
  '#22d3ee','#3b82f6','#a78bfa','#f472b6','#fb7185','#fbbf24',
  '#34d399','#2dd4bf','#60a5fa','#f59e0b','#c084fc','#4ade80'
];
function avatarColor(name){ let s=0; for(const c of name) s+=c.charCodeAt(0); return VOICE_AVATAR_COLORS[s % VOICE_AVATAR_COLORS.length]; }

const VOICES = [
  { name:'Achernar',   g:'F', vi:'Nữ, dịu nhẹ, cao',           en:'Female, soft, high pitch' },
  { name:'Achird',     g:'M', vi:'Nam, thân thiện, trung',      en:'Male, friendly, mid pitch' },
  { name:'Algenib',    g:'M', vi:'Nam, khàn, trầm',             en:'Male, gravelly, low pitch' },
  { name:'Algieba',    g:'M', vi:'Nam, thoải mái, trung-trầm',  en:'Male, easy-going, mid-low' },
  { name:'Alnilam',    g:'M', vi:'Nam, dứt khoát, trung-trầm',  en:'Male, firm, mid-low pitch' },
  { name:'Alnitak',    g:'M', vi:'Nam, ấm, trầm',               en:'Male, warm, low pitch' },
  { name:'Alphard',    g:'F', vi:'Nữ, trong trẻo, cao',         en:'Female, clear, high pitch' },
  { name:'Alpheratz',  g:'F', vi:'Nữ, nhẹ nhàng, trung',        en:'Female, gentle, mid pitch' },
  { name:'Altair',     g:'M', vi:'Nam, mạnh mẽ, trung',         en:'Male, strong, mid pitch' },
  { name:'Antares',    g:'M', vi:'Nam, trầm ấm, trầm',          en:'Male, deep warm, low pitch' },
  { name:'Arcturus',   g:'M', vi:'Nam, điềm tĩnh, trung-trầm',  en:'Male, calm, mid-low pitch' },
  { name:'Bellatrix',  g:'F', vi:'Nữ, sắc sảo, trung',          en:'Female, crisp, mid pitch' },
  { name:'Canopus',    g:'M', vi:'Nam, trang trọng, trầm',      en:'Male, formal, low pitch' },
  { name:'Capella',    g:'F', vi:'Nữ, tươi vui, cao',           en:'Female, cheerful, high pitch' },
  { name:'Castor',     g:'M', vi:'Nam, trẻ trung, trung',       en:'Male, youthful, mid pitch' },
  { name:'Deneb',      g:'F', vi:'Nữ, truyền cảm, trung',       en:'Female, expressive, mid pitch' },
  { name:'Diphda',     g:'M', vi:'Nam, mộc mạc, trung-trầm',    en:'Male, plain, mid-low pitch' },
  { name:'Dubhe',      g:'F', vi:'Nữ, ngọt ngào, cao',          en:'Female, sweet, high pitch' },
  { name:'Electra',    g:'F', vi:'Nữ, năng động, cao',          en:'Female, energetic, high pitch' },
  { name:'Fomalhaut',  g:'M', vi:'Nam, trầm hùng, trầm',        en:'Male, resonant, low pitch' },
  { name:'Hadar',      g:'M', vi:'Nam, thân mật, trung',        en:'Male, intimate, mid pitch' },
  { name:'Izar',       g:'F', vi:'Nữ, ấm áp, trung',            en:'Female, warm, mid pitch' },
  { name:'Mirach',     g:'F', vi:'Nữ, thanh lịch, trung',       en:'Female, elegant, mid pitch' },
  { name:'Mizar',      g:'M', vi:'Nam, tự tin, trung',          en:'Male, confident, mid pitch' },
  { name:'Polaris',    g:'M', vi:'Nam, dẫn chuyện, trung-trầm', en:'Male, narrator, mid-low pitch' },
  { name:'Pollux',     g:'M', vi:'Nam, hài hước, trung',        en:'Male, playful, mid pitch' },
  { name:'Procyon',    g:'F', vi:'Nữ, nhẹ tênh, cao',           en:'Female, airy, high pitch' },
  { name:'Rigel',      g:'M', vi:'Nam, uy lực, trầm',           en:'Male, powerful, low pitch' },
  { name:'Sirius',     g:'F', vi:'Nữ, sáng rõ, cao',            en:'Female, bright, high pitch' },
  { name:'Vega',       g:'F', vi:'Nữ, êm ái, trung',            en:'Female, smooth, mid pitch' },
].map(v => ({ ...v, color: avatarColor(v.name) }));

// ---- Languages ----
const LANGUAGES = [
  { id:'vi', flag:'🇻🇳', label:'Vietnamese', native:'Tiếng Việt' },
  { id:'en', flag:'🇺🇸', label:'English', native:'English' },
  { id:'zh', flag:'🇨🇳', label:'Chinese', native:'中文' },
  { id:'ja', flag:'🇯🇵', label:'Japanese', native:'日本語' },
  { id:'ko', flag:'🇰🇷', label:'Korean', native:'한국어' },
  { id:'fr', flag:'🇫🇷', label:'French', native:'Français' },
  { id:'es', flag:'🇪🇸', label:'Spanish', native:'Español' },
  { id:'de', flag:'🇩🇪', label:'German', native:'Deutsch' },
  { id:'pt', flag:'🇵🇹', label:'Portuguese', native:'Português' },
  { id:'ru', flag:'🇷🇺', label:'Russian', native:'Русский' },
  { id:'hi', flag:'🇮🇳', label:'Hindi', native:'हिन्दी' },
  { id:'ar', flag:'🇸🇦', label:'Arabic', native:'العربية' },
  { id:'th', flag:'🇹🇭', label:'Thai', native:'ไทย' },
  { id:'id', flag:'🇮🇩', label:'Indonesian', native:'Bahasa' },
  { id:'tr', flag:'🇹🇷', label:'Turkish', native:'Türkçe' },
  { id:'it', flag:'🇮🇹', label:'Italian', native:'Italiano' },
];

// ---- Processing modes (Chế độ xử lý) ----
const PROC_MODES = {
  vi: [
    { id:'broadcast', icon:'radio',   label:'Phát thanh', desc:'Chuẩn phát thanh/podcast — ấm, nén gọn, rõ ràng.' },
    { id:'cinema',    icon:'film',    label:'Điện ảnh',   desc:'Dải động rộng, không gian sâu, kịch tính.' },
    { id:'podcast',   icon:'mic',     label:'Podcast',    desc:'Giọng gần, thân mật, ít hậu kỳ.' },
    { id:'raw',       icon:'file',    label:'Nguyên bản', desc:'Không xử lý — giữ nguyên đầu ra mô hình.' },
    { id:'warm',      icon:'sun',     label:'Ấm',         desc:'Tăng dải trầm, mềm mại, dễ chịu.' },
    { id:'bright',    icon:'sparkles',label:'Sáng',       desc:'Tăng dải cao, trong trẻo, tươi sáng.' },
  ],
  en: [
    { id:'broadcast', icon:'radio',   label:'Broadcast', desc:'Radio/podcast standard — warm, compressed, clear.' },
    { id:'cinema',    icon:'film',    label:'Cinematic', desc:'Wide dynamic range, deep space, dramatic.' },
    { id:'podcast',   icon:'mic',     label:'Podcast',   desc:'Close, intimate voice, minimal processing.' },
    { id:'raw',       icon:'file',    label:'Raw',       desc:'No processing — keep raw model output.' },
    { id:'warm',      icon:'sun',     label:'Warm',      desc:'Boosted lows, soft and pleasant.' },
    { id:'bright',    icon:'sparkles',label:'Bright',    desc:'Boosted highs, crisp and vivid.' },
  ],
};

// ---- STT models ----
const STT_MODELS = [
  { id:'tiny',   label:'Tiny',     size:'39M',   vram:'~1 GB VRAM' },
  { id:'base',   label:'Base',     size:'74M',   vram:'~1 GB VRAM' },
  { id:'small',  label:'Small',    size:'244M',  vram:'~2 GB VRAM' },
  { id:'large',  label:'Large v3',  size:'1550M', vram:'~10 GB VRAM' },
  { id:'turbo',  label:'Turbo',    size:'809M',  vram:'~6 GB VRAM' },
];

// ---- i18n ----
const I18N = {
  vi: {
    nav_studio:'Voice Studio', nav_webhook:'Webhook', nav_settings:'Cài đặt',
    plan_studio:'Gói Studio', plan_trial:'Dùng thử', plan_days:'còn 21 ngày', plan_upgrade:'Nâng cấp',
    tab_clone:'Sao chép giọng nói', tab_tts:'Văn bản sang giọng nói', tab_dialogue:'Hội thoại nhiều giọng',
    tab_stt:'Giọng nói sang văn bản', tab_env:'Cài đặt môi trường',
    start:'Bắt đầu tạo', stop:'Dừng', ready:'Sẵn sàng', generating:'Đang tạo…', export:'Xuất âm thanh',
    // clone
    sample_audio:'Tệp âm thanh mẫu (5–10 giây)', choose:'Chọn…', no_file:'Chưa chọn tệp…',
    sample_text:'Văn bản mẫu', required:'bắt buộc', ai_suggest:'AI gợi ý',
    sample_text_ph:'Gõ lại chính xác lời nói trong đoạn âm thanh mẫu (đủ dấu câu, không lỗi chính tả). Văn bản khớp với âm thanh giúp giọng được sao chép chuẩn và tránh AI đọc thêm lời không mong muốn.',
    language:'Ngôn ngữ', adv_settings:'Cài đặt nâng cao', audio_tune:'Tinh chỉnh âm thanh',
    detail:'Độ chi tiết', adherence:'Mức độ bám sát', speed:'Tốc độ đọc', pause:'Khoảng nghỉ',
    proc_mode:'Chế độ xử lý', normalize:'Cân đều âm lượng các câu',
    text_content:'Nội dung văn bản', text_ph:'Nhập một câu ngắn để thử giọng vừa sao chép (tối đa 350 ký tự, coi như 1 dòng).',
    col_content:'Nội dung', col_status:'Trạng thái', col_action:'Hành động', col_time:'Thời gian', col_char:'Nhân vật',
    no_audio:'Chưa có tệp âm thanh', voice_store:'Kho giọng nói', available:'Giọng có sẵn', your_voices:'Giọng của bạn',
    samples:'mẫu', save:'Lưu', backup:'Sao lưu',
    backup_all:'Sao lưu toàn bộ kho giọng…', backup_load:'Nạp backup từ file .vcp…', backup_open:'Mở thư mục lưu kho giọng',
    your_voices_empty:'Clone xong, bấm Lưu để thêm giọng vào đây.',
    search_voice:'Tìm giọng theo tên hoặc mô tả…', all:'Tất cả', male:'Nam', female:'Nữ', starred:'Đã gắn sao',
    no_voice_found:'Không tìm thấy giọng phù hợp.',
    // tts
    voice:'Giọng nói', preset_voice:'Giọng có sẵn', random_voice:'Giọng ngẫu nhiên',
    pick_from_store:'Chọn giọng từ kho', gender:'Giới tính', age:'Độ tuổi', pitch:'Cao độ', accent:'Khẩu âm', auto:'Auto',
    split_style:'Kiểu tách câu', split_auto:'Tự động (dấu .)', speak:'Phát âm', input_table:'Nhập vào bảng', import_file:'Nhập tệp (.txt, .srt)',
    batch:'Xử lý hàng loạt', concurrent:'Số câu đồng thời', export_sec:'Xuất file', format:'Định dạng',
    export_type:'Kiểu xuất', export_merge:'Gộp thành 1 file', export_split:'Tách từng dòng', save_folder:'Thư mục lưu', export_srt:'Xuất kèm phụ đề (.srt)',
    tts_text_ph:'Nhập nội dung cần tạo âm thanh.\nNhớ chọn Kiểu tách câu phù hợp — tránh câu quá dài khiến giọng đọc bị hụt hơi.',
    // dialogue
    cast:'Phân vai giọng đọc', analyze:'Phân tích hội thoại', dialogue_tpl:'Mẫu hội thoại chuẩn',
    add_char:'Thêm nhân vật', dialogue_text_ph:'Nhập kịch bản hội thoại. Dùng định dạng "Tên: lời thoại" mỗi dòng, hoặc bấm Phân tích hội thoại để tự gán vai.',
    // stt
    audio_video:'Tệp Âm thanh / Video', recog_model:'Model nhận dạng', download:'Tải', audio_lang:'Ngôn ngữ âm thanh', auto_detect:'Tự nhận diện',
    not_downloaded:'Chưa tải — bấm nút Tải, hoặc sẽ tự tải khi nhận dạng lần đầu.', extract_result:'Kết quả trích xuất', export_result:'Xuất kết quả',
    stt_empty:'Chọn một tệp âm thanh hoặc video rồi bấm Bắt đầu tạo để trích xuất văn bản.',
    // env
    model_mgmt:'Quản lý Model AI', status:'Trạng thái', not_on_device:'Chưa tải về máy', on_device:'Đã sẵn sàng trên máy',
    path:'Đường dẫn', open_folder:'Mở thư mục', auto_download:'Tải tự động', manual_download:'Tải thủ công',
    hardware:'Thông tin phần cứng', gpu:'GPU', good_support:'Hỗ trợ tốt', hw_accel:'Tăng tốc phần cứng',
    hw_note:'Vonia chạy mô hình AI tạo giọng trực tiếp trên máy bạn. Để có trải nghiệm tốt nhất, máy nên có card đồ họa NVIDIA (Windows) hoặc chip Apple Silicon (macOS M1/M2/M3/M4…). Máy không có GPU vẫn chạy được nhưng sẽ chậm hơn đáng kể.',
    auto_vram:'Tự động giải phóng VRAM', when_idle:'Khi nhàn rỗi', min5:'5 phút', min10:'10 phút', min15:'15 phút', never:'Không bao giờ',
    // settings modal
    sys_settings:'Cài đặt hệ thống', tab_license:'Tài khoản bản quyền', tab_general:'Cài đặt chung', tab_logs:'Logs',
    user:'Người dùng', refresh:'Làm mới', logout_device:'Đăng xuất thiết bị',
    guest:'Khách', sign_in_google:'Đăng nhập bằng Google', using_now:'Đang dùng', signed_in_toast:'Đã đăng nhập', signed_out_toast:'Đã đăng xuất',
    license_note:'Sau khi thanh toán thành công, vui lòng chờ 1–5 phút để hệ thống cập nhật, sau đó bấm "Làm mới".',
    free:'Miễn phí', included:'Đã bao gồm', upgrade_now:'Nâng cấp ngay', per_days:'/ 30 ngày',
    trial_limit:'Dùng thử miễn phí: tối đa 1 dòng/lượt tạo.', try_first:'Hãy dùng thử để đảm bảo thiết bị chạy mượt trước khi mua.', no_refund:'Sau khi thanh toán không hỗ trợ hoàn tiền.',
    interface_lang:'Ngôn ngữ giao diện', file_naming:'Đặt tên file', naming_style:'Kiểu đặt tên', prefix:'Tiền tố', separator:'Ký tự phân cách',
    min_digits:'Số chữ số tối thiểu', max_len:'Độ dài tối đa nội dung', preview:'Xem trước', restore_default:'Khôi phục mặc định',
    author:'Thông tin tác giả', name:'Tên', website:'Website', copy_all:'Copy tất cả', clear:'Xóa', no_logs:'Chưa có log nào.',
    // onboarding
    ob_skip:'Bỏ qua', ob_next:'Tiếp tục', ob_back:'Quay lại', ob_done:'Bắt đầu dùng',
    welcome:'Chào mừng đến với Vonia', queue:'Hàng đợi', done_status:'Hoàn tất', failed:'Lỗi', processing:'Đang xử lý',
    expand:'Mở rộng', collapse:'Thu gọn',
  },
  en: {
    nav_studio:'Voice Studio', nav_webhook:'Webhook', nav_settings:'Settings',
    plan_studio:'Studio plan', plan_trial:'Trial', plan_days:'21 days left', plan_upgrade:'Upgrade',
    tab_clone:'Voice clone', tab_tts:'Text to speech', tab_dialogue:'Multi-voice dialogue',
    tab_stt:'Speech to text', tab_env:'Environment',
    start:'Generate', stop:'Stop', ready:'Ready', generating:'Generating…', export:'Export audio',
    sample_audio:'Sample audio (5–10 sec)', choose:'Browse…', no_file:'No file selected…',
    sample_text:'Sample transcript', required:'required', ai_suggest:'AI suggest',
    sample_text_ph:'Type the exact words spoken in the sample audio (full punctuation, no typos). Matching text helps clone the voice accurately and avoids the AI adding unwanted words.',
    language:'Language', adv_settings:'Advanced settings', audio_tune:'Audio tuning',
    detail:'Detail', adherence:'Adherence', speed:'Reading speed', pause:'Pause length',
    proc_mode:'Processing mode', normalize:'Normalize loudness across sentences',
    text_content:'Text content', text_ph:'Type a short sentence to preview the cloned voice (max 350 chars, treated as 1 line).',
    col_content:'Content', col_status:'Status', col_action:'Action', col_time:'Time', col_char:'Character',
    no_audio:'No audio file yet', voice_store:'Voice store', available:'Available voices', your_voices:'Your voices',
    samples:'samples', save:'Save', backup:'Backup',
    backup_all:'Back up entire voice store…', backup_load:'Load backup from .vcp file…', backup_open:'Open voice store folder',
    your_voices_empty:'After cloning, click Save to add the voice here.',
    search_voice:'Search voices by name or description…', all:'All', male:'Male', female:'Female', starred:'Starred',
    no_voice_found:'No matching voices found.',
    voice:'Voice', preset_voice:'Preset voices', random_voice:'Random voice',
    pick_from_store:'Pick from store', gender:'Gender', age:'Age', pitch:'Pitch', accent:'Accent', auto:'Auto',
    split_style:'Split style', split_auto:'Auto (period .)', speak:'Speak', input_table:'Add to table', import_file:'Import file (.txt, .srt)',
    batch:'Batch processing', concurrent:'Concurrent lines', export_sec:'Export', format:'Format',
    export_type:'Export type', export_merge:'Merge into 1 file', export_split:'Split per line', save_folder:'Save folder', export_srt:'Export with subtitles (.srt)',
    tts_text_ph:'Type the content to synthesize.\nPick a suitable split style — avoid lines too long for one breath.',
    cast:'Cast voices', analyze:'Analyze dialogue', dialogue_tpl:'Sample dialogue',
    add_char:'Add character', dialogue_text_ph:'Type the dialogue script. Use "Name: line" per row, or click Analyze dialogue to auto-assign roles.',
    audio_video:'Audio / Video file', recog_model:'Recognition model', download:'Download', audio_lang:'Audio language', auto_detect:'Auto-detect',
    not_downloaded:'Not downloaded — click Download, or it will auto-download on first run.', extract_result:'Extracted result', export_result:'Export result',
    stt_empty:'Choose an audio or video file then click Generate to extract text.',
    model_mgmt:'AI model management', status:'Status', not_on_device:'Not downloaded', on_device:'Ready on device',
    path:'Path', open_folder:'Open folder', auto_download:'Auto download', manual_download:'Manual download',
    hardware:'Hardware info', gpu:'GPU', good_support:'Well supported', hw_accel:'Hardware acceleration',
    hw_note:'Vonia runs voice AI models directly on your machine. For the best experience use an NVIDIA GPU (Windows) or Apple Silicon (macOS M1/M2/M3/M4…). Machines without a GPU still work but noticeably slower.',
    auto_vram:'Auto-free VRAM', when_idle:'When idle', min5:'5 minutes', min10:'10 minutes', min15:'15 minutes', never:'Never',
    sys_settings:'System settings', tab_license:'License account', tab_general:'General', tab_logs:'Logs',
    user:'User', refresh:'Refresh', logout_device:'Log out device',
    guest:'Guest', sign_in_google:'Sign in with Google', using_now:'In use', signed_in_toast:'Signed in', signed_out_toast:'Signed out',
    license_note:'After successful payment, please wait 1–5 minutes for the system to update, then click "Refresh".',
    free:'Free', included:'Included', upgrade_now:'Upgrade now', per_days:'/ 30 days',
    trial_limit:'Free trial: up to 1 line per generation.', try_first:'Try it first to make sure your device runs smoothly before buying.', no_refund:'No refunds after payment.',
    interface_lang:'Interface language', file_naming:'File naming', naming_style:'Naming style', prefix:'Prefix', separator:'Separator',
    min_digits:'Minimum digits', max_len:'Max content length', preview:'Preview', restore_default:'Restore default',
    author:'Author', name:'Name', website:'Website', copy_all:'Copy all', clear:'Clear', no_logs:'No logs yet.',
    ob_skip:'Skip', ob_next:'Continue', ob_back:'Back', ob_done:'Get started',
    welcome:'Welcome to Vonia', queue:'Queue', done_status:'Done', failed:'Failed', processing:'Processing',
    expand:'Expand', collapse:'Collapse',
  }
};

Object.assign(window, { VOICES, LANGUAGES, PROC_MODES, STT_MODELS, I18N, avatarColor });
