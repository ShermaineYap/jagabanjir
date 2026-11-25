import type { Lang, Level } from "./types";

export interface MessageInput {
  label: string; // e.g. "Rumah Mak"
  station: string; // JPS station name, kept as written
  level: number | null;
  danger: number | null;
  /** ISO time of the reading */
  at: string | null;
}

export const LANGS: { code: Lang; name: string; native: string; speech: string }[] = [
  { code: "ms", name: "Malay", native: "Bahasa Melayu", speech: "ms-MY" },
  { code: "zh", name: "Chinese", native: "中文", speech: "zh-CN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", speech: "ta-IN" },
  { code: "en", name: "English", native: "English", speech: "en-GB" },
];

/** "2026-11-25T19:45:00+08:00" -> "19:45" in Malaysia time */
export function hhmm(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const m2 = (v: number) => v.toFixed(2);

type Parts = { level: string; danger: string | null; time: string };
type Tpl = Record<Level | "UNKNOWN", (i: MessageInput, p: Parts) => string>;

const T: Record<Lang, { tpl: Tpl; footer: string; unit: string }> = {
  ms: {
    unit: "m",
    footer: "Ini bukan amaran rasmi. Ikut arahan Bomba, APM dan polis.",
    tpl: {
      NORMAL: (i, p) => `✅ ${i.label}: Paras sungai di ${i.station} sudah NORMAL semula (${p.level} m, jam ${p.time}).`,
      ALERT: (i, p) =>
        `⚠️ WASPADA — ${i.label}\nSungai di ${i.station} naik ke paras WASPADA: ${p.level} m${p.danger ? ` (paras bahaya ${p.danger} m)` : ""}, jam ${p.time}.\nSediakan sekarang:\n1) Dokumen penting dan ubat dalam beg kalis air\n2) Cas telefon\n3) Alihkan barang ke tempat tinggi`,
      WARNING: (i, p) =>
        `🟠 AMARAN — ${i.label}\nSungai di ${i.station} sudah ke paras AMARAN: ${p.level} m${p.danger ? ` (paras bahaya ${p.danger} m)` : ""}, jam ${p.time}.\nBersedia untuk berpindah:\n1) Matikan suis utama elektrik jika air masuk\n2) Alihkan kereta ke tempat tinggi\n3) Hubungi keluarga atau ketua kampung`,
      DANGER: (i, p) =>
        `🔴 BAHAYA — ${i.label}\nSungai di ${i.station} sudah ke paras BAHAYA: ${p.level} m, jam ${p.time}.\nBerpindah SEKARANG ke pusat pemindahan (PPS) atau tempat tinggi.\nJangan redah air. Kecemasan: 999`,
      UNKNOWN: (i, p) =>
        `❓ ${i.label}: Sensor sungai di ${i.station} tidak menghantar data baharu sejak jam ${p.time}. Kami tidak dapat pastikan keadaan. Sila telefon keluarga atau jiran.`,
    },
  },
  zh: {
    unit: "米",
    footer: "这不是官方警报。请听从消防局、民防部队和警方的指示。",
    tpl: {
      NORMAL: (i, p) => `✅ ${i.label}：${i.station} 的河水水位已恢复正常（${p.level}米，${p.time}）。`,
      ALERT: (i, p) =>
        `⚠️ 警戒 — ${i.label}\n${i.station} 的河水已上升到警戒水位：${p.level}米${p.danger ? `（危险水位${p.danger}米）` : ""}，时间${p.time}。\n请现在准备：\n1）把重要文件和药物放进防水袋\n2）给手机充电\n3）把物品搬到高处`,
      WARNING: (i, p) =>
        `🟠 警告 — ${i.label}\n${i.station} 的河水已达到警告水位：${p.level}米${p.danger ? `（危险水位${p.danger}米）` : ""}，时间${p.time}。\n请准备撤离：\n1）如果水进屋，关掉总电源\n2）把车移到高处\n3）联系家人或村长`,
      DANGER: (i, p) =>
        `🔴 危险 — ${i.label}\n${i.station} 的河水已达到危险水位：${p.level}米，时间${p.time}。\n请立刻撤离到疏散中心（PPS）或高处。\n不要涉水。紧急电话：999`,
      UNKNOWN: (i, p) =>
        `❓ ${i.label}：${i.station} 的河流感应器从${p.time}起没有新数据，我们无法确认情况。请打电话给家人或邻居。`,
    },
  },
  ta: {
    unit: "மீ.",
    footer: "இது அதிகாரப்பூர்வ எச்சரிக்கை அல்ல. தீயணைப்பு, APM, காவல்துறை அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.",
    tpl: {
      NORMAL: (i, p) =>
        `✅ ${i.label}: ${i.station} ஆற்று நீர்மட்டம் மீண்டும் இயல்பு நிலைக்குத் திரும்பியது (${p.level} மீ., ${p.time}).`,
      ALERT: (i, p) =>
        `⚠️ விழிப்பு நிலை — ${i.label}\n${i.station} ஆற்று நீர்மட்டம் ${p.time} மணிக்கு ${p.level} மீ. ஆக உயர்ந்துள்ளது${p.danger ? ` (அபாய நிலை ${p.danger} மீ.)` : ""}.\nஇப்போதே தயார் செய்யுங்கள்:\n1) முக்கிய ஆவணங்கள், மருந்துகளை நீர்புகா பையில் வையுங்கள்\n2) கைப்பேசியை சார்ஜ் செய்யுங்கள்\n3) பொருட்களை உயரமான இடத்திற்கு மாற்றுங்கள்`,
      WARNING: (i, p) =>
        `🟠 எச்சரிக்கை நிலை — ${i.label}\n${i.station} ஆற்று நீர்மட்டம் ${p.time} மணிக்கு ${p.level} மீ. ஆக உள்ளது${p.danger ? ` (அபாய நிலை ${p.danger} மீ.)` : ""}.\nவெளியேறத் தயாராகுங்கள்:\n1) வீட்டுக்குள் நீர் வந்தால் மின்சார முதன்மை சுவிட்சை அணையுங்கள்\n2) காரை உயரமான இடத்திற்கு நகர்த்துங்கள்\n3) குடும்பத்தினரையோ கிராமத் தலைவரையோ தொடர்பு கொள்ளுங்கள்`,
      DANGER: (i, p) =>
        `🔴 அபாயம் — ${i.label}\n${i.station} ஆற்று நீர்மட்டம் ${p.time} மணிக்கு அபாய நிலையான ${p.level} மீ. ஐ எட்டியுள்ளது.\nஉடனே நிவாரண மையத்திற்கு (PPS) அல்லது உயரமான இடத்திற்குச் செல்லுங்கள்.\nவெள்ளநீரில் நடக்காதீர்கள். அவசர அழைப்பு: 999`,
      UNKNOWN: (i, p) =>
        `❓ ${i.label}: ${i.station} ஆற்று உணரி ${p.time} முதல் புதிய தரவு அனுப்பவில்லை. நிலையை உறுதிப்படுத்த முடியவில்லை. குடும்பத்தினரையோ அண்டை வீட்டாரையோ அழையுங்கள்.`,
    },
  },
  en: {
    unit: "m",
    footer: "This is not an official warning. Follow instructions from Bomba, APM and the police.",
    tpl: {
      NORMAL: (i, p) => `✅ ${i.label}: The river at ${i.station} is back to NORMAL (${p.level} m at ${p.time}).`,
      ALERT: (i, p) =>
        `⚠️ ALERT — ${i.label}\nThe river at ${i.station} has risen to ALERT level: ${p.level} m${p.danger ? ` (danger level ${p.danger} m)` : ""} at ${p.time}.\nGet ready now:\n1) Put documents and medicine in a waterproof bag\n2) Charge your phone\n3) Move belongings up high`,
      WARNING: (i, p) =>
        `🟠 WARNING — ${i.label}\nThe river at ${i.station} has reached WARNING level: ${p.level} m${p.danger ? ` (danger level ${p.danger} m)` : ""} at ${p.time}.\nBe ready to leave:\n1) Switch off the main power if water comes in\n2) Move the car to high ground\n3) Call family or the village head`,
      DANGER: (i, p) =>
        `🔴 DANGER — ${i.label}\nThe river at ${i.station} has reached DANGER level: ${p.level} m at ${p.time}.\nLeave NOW for a relief centre (PPS) or high ground.\nDo not walk through floodwater. Emergency: 999`,
      UNKNOWN: (i, p) =>
        `❓ ${i.label}: The river sensor at ${i.station} has sent no new data since ${p.time}. We cannot tell what is happening. Please call family or a neighbour.`,
    },
  },
};

export function compose(lang: Lang, level: Level | "UNKNOWN", input: MessageInput): string {
  const parts: Parts = {
    level: input.level !== null ? m2(input.level) : "—",
    danger: input.danger !== null ? m2(input.danger) : null,
    time: hhmm(input.at),
  };
  const body = T[lang].tpl[level](input, parts);
  return `${body}\n\n${T[lang].footer}`;
}

/** Numbers that may legitimately appear in a message built from this input. */
function allowedNumbers(input: MessageInput): Set<string> {
  const ok = new Set<string>(["1", "2", "3", "999"]);
  if (input.level !== null) ok.add(m2(input.level));
  if (input.danger !== null) ok.add(m2(input.danger));
  const t = hhmm(input.at);
  ok.add(t.slice(0, 2));
  ok.add(t.slice(3, 5));
  // digits that are part of the user's label or the JPS station name are not ours to check
  for (const src of [input.label, input.station]) for (const n of src.match(/\d+(?:\.\d+)?/g) ?? []) ok.add(n);
  return ok;
}

/**
 * Check that every number in the message traces back to the source reading.
 * Returns the offending numbers; an empty list means the message passed.
 */
export function verify(message: string, input: MessageInput): string[] {
  const ok = allowedNumbers(input);
  const found = message.match(/\d+(?:\.\d+)?/g) ?? [];
  return found.filter((n) => !ok.has(n));
}

/** Plain text for text-to-speech: drop emoji and list numbering clutter. */
export function forSpeech(message: string): string {
  return message
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
    .replace(/^\s*\d\)\s*/gm, "")
    .replace(/—/g, ",")
    .trim();
}
