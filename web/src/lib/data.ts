/* Voices, languages, processing modes, STT models — ported from the design. */

const VOICE_AVATAR_COLORS = [
  '#22d3ee', '#3b82f6', '#a78bfa', '#f472b6', '#fb7185', '#fbbf24',
  '#34d399', '#2dd4bf', '#60a5fa', '#f59e0b', '#c084fc', '#4ade80',
]
export function avatarColor(name: string): string {
  let s = 0
  for (const c of name) s += c.charCodeAt(0)
  return VOICE_AVATAR_COLORS[s % VOICE_AVATAR_COLORS.length]
}

export interface Voice { name: string; g: 'M' | 'F'; vi: string; en: string; color: string }

const RAW_VOICES: Omit<Voice, 'color'>[] = [
  { name: 'Achernar', g: 'F', vi: 'Nữ, dịu nhẹ, cao', en: 'Female, soft, high pitch' },
  { name: 'Achird', g: 'M', vi: 'Nam, thân thiện, trung', en: 'Male, friendly, mid pitch' },
  { name: 'Algenib', g: 'M', vi: 'Nam, khàn, trầm', en: 'Male, gravelly, low pitch' },
  { name: 'Algieba', g: 'M', vi: 'Nam, thoải mái, trung-trầm', en: 'Male, easy-going, mid-low' },
  { name: 'Alnilam', g: 'M', vi: 'Nam, dứt khoát, trung-trầm', en: 'Male, firm, mid-low pitch' },
  { name: 'Alnitak', g: 'M', vi: 'Nam, ấm, trầm', en: 'Male, warm, low pitch' },
  { name: 'Alphard', g: 'F', vi: 'Nữ, trong trẻo, cao', en: 'Female, clear, high pitch' },
  { name: 'Alpheratz', g: 'F', vi: 'Nữ, nhẹ nhàng, trung', en: 'Female, gentle, mid pitch' },
  { name: 'Altair', g: 'M', vi: 'Nam, mạnh mẽ, trung', en: 'Male, strong, mid pitch' },
  { name: 'Antares', g: 'M', vi: 'Nam, trầm ấm, trầm', en: 'Male, deep warm, low pitch' },
  { name: 'Arcturus', g: 'M', vi: 'Nam, điềm tĩnh, trung-trầm', en: 'Male, calm, mid-low pitch' },
  { name: 'Bellatrix', g: 'F', vi: 'Nữ, sắc sảo, trung', en: 'Female, crisp, mid pitch' },
  { name: 'Canopus', g: 'M', vi: 'Nam, trang trọng, trầm', en: 'Male, formal, low pitch' },
  { name: 'Capella', g: 'F', vi: 'Nữ, tươi vui, cao', en: 'Female, cheerful, high pitch' },
  { name: 'Castor', g: 'M', vi: 'Nam, trẻ trung, trung', en: 'Male, youthful, mid pitch' },
  { name: 'Deneb', g: 'F', vi: 'Nữ, truyền cảm, trung', en: 'Female, expressive, mid pitch' },
  { name: 'Diphda', g: 'M', vi: 'Nam, mộc mạc, trung-trầm', en: 'Male, plain, mid-low pitch' },
  { name: 'Dubhe', g: 'F', vi: 'Nữ, ngọt ngào, cao', en: 'Female, sweet, high pitch' },
  { name: 'Electra', g: 'F', vi: 'Nữ, năng động, cao', en: 'Female, energetic, high pitch' },
  { name: 'Fomalhaut', g: 'M', vi: 'Nam, trầm hùng, trầm', en: 'Male, resonant, low pitch' },
  { name: 'Hadar', g: 'M', vi: 'Nam, thân mật, trung', en: 'Male, intimate, mid pitch' },
  { name: 'Izar', g: 'F', vi: 'Nữ, ấm áp, trung', en: 'Female, warm, mid pitch' },
  { name: 'Mirach', g: 'F', vi: 'Nữ, thanh lịch, trung', en: 'Female, elegant, mid pitch' },
  { name: 'Mizar', g: 'M', vi: 'Nam, tự tin, trung', en: 'Male, confident, mid pitch' },
  { name: 'Polaris', g: 'M', vi: 'Nam, dẫn chuyện, trung-trầm', en: 'Male, narrator, mid-low pitch' },
  { name: 'Pollux', g: 'M', vi: 'Nam, hài hước, trung', en: 'Male, playful, mid pitch' },
  { name: 'Procyon', g: 'F', vi: 'Nữ, nhẹ tênh, cao', en: 'Female, airy, high pitch' },
  { name: 'Rigel', g: 'M', vi: 'Nam, uy lực, trầm', en: 'Male, powerful, low pitch' },
  { name: 'Sirius', g: 'F', vi: 'Nữ, sáng rõ, cao', en: 'Female, bright, high pitch' },
  { name: 'Vega', g: 'F', vi: 'Nữ, êm ái, trung', en: 'Female, smooth, mid pitch' },
]
export const VOICES: Voice[] = RAW_VOICES.map(v => ({ ...v, color: avatarColor(v.name) }))

export interface Language { id: string; flag: string; label: string; native: string }
export const LANGUAGES: Language[] = [
  { id: 'vi', flag: '🇻🇳', label: 'Vietnamese', native: 'Tiếng Việt' },
  { id: 'en', flag: '🇺🇸', label: 'English', native: 'English' },
  { id: 'zh', flag: '🇨🇳', label: 'Chinese', native: '中文' },
  { id: 'ja', flag: '🇯🇵', label: 'Japanese', native: '日本語' },
  { id: 'ko', flag: '🇰🇷', label: 'Korean', native: '한국어' },
  { id: 'fr', flag: '🇫🇷', label: 'French', native: 'Français' },
  { id: 'es', flag: '🇪🇸', label: 'Spanish', native: 'Español' },
  { id: 'de', flag: '🇩🇪', label: 'German', native: 'Deutsch' },
  { id: 'pt', flag: '🇵🇹', label: 'Portuguese', native: 'Português' },
  { id: 'ru', flag: '🇷🇺', label: 'Russian', native: 'Русский' },
  { id: 'hi', flag: '🇮🇳', label: 'Hindi', native: 'हिन्दी' },
  { id: 'ar', flag: '🇸🇦', label: 'Arabic', native: 'العربية' },
  { id: 'th', flag: '🇹🇭', label: 'Thai', native: 'ไทย' },
  { id: 'id', flag: '🇮🇩', label: 'Indonesian', native: 'Bahasa' },
  { id: 'tr', flag: '🇹🇷', label: 'Turkish', native: 'Türkçe' },
  { id: 'it', flag: '🇮🇹', label: 'Italian', native: 'Italiano' },
]
// map UI language id -> OmniVoice language name
export const LANG_NAME: Record<string, string> = Object.fromEntries(
  LANGUAGES.map(l => [l.id, l.label]),
)

export interface ProcMode { id: string; icon: string; label: string; desc: string }
export const PROC_MODES: Record<string, ProcMode[]> = {
  vi: [
    { id: 'broadcast', icon: 'radio', label: 'Phát thanh', desc: 'Chuẩn phát thanh/podcast — ấm, nén gọn, rõ ràng.' },
    { id: 'cinema', icon: 'film', label: 'Điện ảnh', desc: 'Dải động rộng, không gian sâu, kịch tính.' },
    { id: 'podcast', icon: 'mic', label: 'Podcast', desc: 'Giọng gần, thân mật, ít hậu kỳ.' },
    { id: 'raw', icon: 'file', label: 'Nguyên bản', desc: 'Không xử lý — giữ nguyên đầu ra mô hình.' },
    { id: 'warm', icon: 'sun', label: 'Ấm', desc: 'Tăng dải trầm, mềm mại, dễ chịu.' },
    { id: 'bright', icon: 'sparkles', label: 'Sáng', desc: 'Tăng dải cao, trong trẻo, tươi sáng.' },
  ],
  en: [
    { id: 'broadcast', icon: 'radio', label: 'Broadcast', desc: 'Radio/podcast standard — warm, compressed, clear.' },
    { id: 'cinema', icon: 'film', label: 'Cinematic', desc: 'Wide dynamic range, deep space, dramatic.' },
    { id: 'podcast', icon: 'mic', label: 'Podcast', desc: 'Close, intimate voice, minimal processing.' },
    { id: 'raw', icon: 'file', label: 'Raw', desc: 'No processing — keep raw model output.' },
    { id: 'warm', icon: 'sun', label: 'Warm', desc: 'Boosted lows, soft and pleasant.' },
    { id: 'bright', icon: 'sparkles', label: 'Bright', desc: 'Boosted highs, crisp and vivid.' },
  ],
}

export interface SttModel { id: string; label: string; size: string; vram: string }
export const STT_MODELS: SttModel[] = [
  { id: 'tiny', label: 'Tiny', size: '39M', vram: '~1 GB VRAM' },
  { id: 'base', label: 'Base', size: '74M', vram: '~1 GB VRAM' },
  { id: 'small', label: 'Small', size: '244M', vram: '~2 GB VRAM' },
  { id: 'large', label: 'Large v3', size: '1550M', vram: '~10 GB VRAM' },
  { id: 'turbo', label: 'Turbo', size: '809M', vram: '~6 GB VRAM' },
]
