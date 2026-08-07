import { supabase, SUPABASE_URL } from './supabase';
import type { TadabburResponse, CoachAnalysis, TilawahLog } from './types';
import { todayISODate, getNow } from './habit';

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };
}

function edgeUrl(slug: string): string {
  return `${SUPABASE_URL}/functions/v1/${slug}`;
}

/**
 * Resolve the Gemini API key from any supported environment source.
 * In Vite, only VITE_-prefixed vars are exposed to the browser. The other
 * two are checked defensively in case this code ever runs in a Node context.
 */
function getGeminiApiKey(): string | null {
  const candidates = [
    (import.meta as any).env?.VITE_GEMINI_API_KEY,
    (import.meta as any).env?.GEMINI_API_KEY,
    typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.0-flash'];

interface GeminiCallResult {
  text: string | null;
  error: string | null;
}

async function callGeminiDirect(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxOutputTokens?: number; jsonMode?: boolean } = {},
): Promise<GeminiCallResult> {
  const errors: string[] = [];
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: opts.temperature ?? 0.8,
              maxOutputTokens: opts.maxOutputTokens ?? 300,
              ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        },
      );
      if (res.status === 404) {
        errors.push(`${model}: 404 model tidak ditemukan`);
        continue;
      }
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Gemini ${model}] HTTP ${res.status}:`, errText);
        errors.push(`${model}: HTTP ${res.status}`);
        if (model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
          return { text: null, error: `Gemini API error (${res.status}). Periksa API key dan kuota.` };
        }
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return { text, error: null };
      errors.push(`${model}: respons kosong`);
    } catch (err) {
      console.error(`[Gemini ${model}] fetch error:`, err);
      errors.push(`${model}: gagal koneksi`);
    }
  }
  return { text: null, error: `Semua model gagal. Detail: ${errors.join(' | ')}` };
}

const TADABBUR_SYSTEM = `Kamu adalah seorang ahli tafsir Al-Qur'an yang ramah, menenangkan, dan bijaksana, melayani komunitas pemuda masjid di Indonesia.

Tugasmu: memberikan tadabbur dan refleksi singkat berdasarkan kandungan makna asli dari ayat Al-Qur'an yang dibaca pengguna.

ATURAN MUTLAK:
1. Kamu WAJIB menggunakan pengetahuanmu tentang ISI dan KANDUNGAN nyata dari surah serta ayat-ayat yang disebutkan pengguna. Jangan menghasilkan kalimat generik yang bisa berlaku untuk surah mana pun.
2. Sebutkan atau rujuk tema/pesan spesifik dari ayat tersebut (misalnya: kesabaran Nabi Yunus dalam perut ikan, rezeki dari Allah, larangan riba, kisah Ashabul Kahfi, sifat orang beriman, dll) sesuai dengan kandungan asli ayat itu.
3. Tulis dalam Bahasa Indonesia yang hangat, santun, dan mudah dipahami remaja maupun orang dewasa sibuk.
4. Panjang tepat 2-3 kalimat, tidak lebih, tidak kurang.
5. Jangan mengutip ayat Arab; fokus pada makna dan pesan spiritualnya.
6. Hubungkan pesan ayat tersebut dengan kehidupan sehari-hari (pekerjaan, sekolah, keluarga, kesabaran, syukur, atau ketetenangan hati).
7. Nada: menenangkan, menyemangati, tidak menggurui.
8. Jangan pernah menambahkan label seperti "Tadabbur:", "Refleksi:", atau penjelasan meta. Langsung berikan kalimat refleksinya saja.`;

function tadabburFallback(surah: string, ayat: string): string {
  return `Membaca ${surah} ayat ${ayat} mengingatkan kita untuk senantiasa bersyukur dan bersabar dalam menjalani hari. Setiap ayat Al-Qur'an adalah cahaya yang menenangkan hati di tengah kesibukan dunia. Semoga bacaanmu hari ini menjadi amal jariyah yang berkah.`;
}

function buildTadabburPrompt(surahName: string, ayatStart: number, ayatEnd: number, juz: number): string {
  const ayatRange = ayatEnd && ayatEnd !== ayatStart ? `${ayatStart}-${ayatEnd}` : `${ayatStart}`;
  return `Berikan tadabbur dan refleksi singkat (2-3 kalimat) khusus berdasarkan kandungan makna asli dari Surat ${surahName} ayat ${ayatRange} (Juz ${juz}).

Jangan gunakan kalimat umum atau template. Bahas poin spiritual spesifik dari ayat tersebut secara hangat dan menenangkan, lalu kaitkan dengan kehidupan sehari-hari.

Ingat: setiap surah dan ayat memiliki pesan unik. Refleksi untuk ${surahName} ayat ${ayatRange} harus berbeda dari refleksi surah lain.`;
}

export async function fetchTadabbur(
  surahName: string,
  ayatStart: number,
  ayatEnd: number,
  juz: number
): Promise<TadabburResponse> {
  // 1) Try the edge function first (server-side key)
  try {
    const res = await fetch(edgeUrl('ai-tadabbur'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ surah_name: surahName, ayat_start: ayatStart, ayat_end: ayatEnd, juz }),
    });
    const data = await res.json();
    if (res.ok && data?.tadabbur) return { tadabbur: data.tadabbur };
    if (res.ok && data?.error) {
      console.warn('[ai-tadabbur] edge error:', data.error);
    } else if (!res.ok) {
      console.warn('[ai-tadabbur] edge HTTP', res.status);
    }
  } catch (err) {
    console.warn('[ai-tadabbur] edge unreachable:', err);
  }

  // 2) Frontend direct fallback using the browser-exposed key
  const apiKey = getGeminiApiKey();
  const ayatRange = ayatEnd && ayatEnd !== ayatStart ? `${ayatStart}-${ayatEnd}` : `${ayatStart}`;

  if (!apiKey) {
    console.warn('[ai-tadabbur] No Gemini API key found in env. Using static fallback.');
    return { tadabbur: tadabburFallback(surahName, ayatRange), error: 'API Key Gemini tidak ditemukan. Tadabbur statis digunakan.' };
  }

  const { text, error } = await callGeminiDirect(
    apiKey,
    TADABBUR_SYSTEM,
    buildTadabburPrompt(surahName, ayatStart, ayatEnd, juz),
    { temperature: 0.8, maxOutputTokens: 300 },
  );

  if (text) return { tadabbur: text };
  console.error('[ai-tadabbur] direct Gemini failed:', error);
  // 3) Never block the user — return a fallback reflection so they can save the log
  return { tadabbur: tadabburFallback(surahName, ayatRange) };
}

const COACH_SYSTEM = `Kamu adalah AI Personal Coach untuk konsistensi tilawah Al-Qur'an, melayani pemuda dan pengajar masjid di Indonesia.

Tugasmu: menganalisis data tilawah harian DAN kumulatif mingguan seorang pengguna, lalu memberikan evaluasi personal yang ramah, taktis, dan membangun.

Aturan penulisan:
- Tulis dalam Bahasa Indonesia yang hangat, memotivasi, dan tidak menggurui.
- Struktur output WAJIB berupa JSON valid dengan format berikut (tanpa markdown code block, tanpa teks di luar JSON):
{
  "summary": "1-2 kalimat gambaran umum konsistensi minggu ini",
  "daily_missed": ["daftar waktu yang terlewat HARI INI, misal: 'Pagi', 'Siang' — kosongkan [] jika tidak ada yang terlewat"],
  "daily_tip": "1 tips pemulihan cepat untuk hari ini (mikro-habit, 1 kalimat)",
  "weakest_time": "waktu yang paling sering terlewat dalam 7 hari (pagi/siang/sore) atau 'merata' jika tidak ada pola jelas",
  "weekly_missed_count": "jumlah berapa kali waktu terlemah terlewat dalam 7 hari (angka)",
  "weekly_analysis": "2-3 kalimat menjelaskan akar masalah psikologis/rutinitas kenapa waktu tersebut paling sering terlewat (misal: kelelahan malam hari, tergesa-gesa jam kerja, begadang)",
  "solutions": ["solusi taktis 1", "solusi taktis 2", "solusi taktis 3"]
}
- Setiap solusi harus konkret, ringkas (1-2 kalimat), dan bisa langsung dilakukan orang sibuk.
- Solusi harus spesifik terhadap waktu shalat yang paling lemah, bukan saran generik.
- Jika tidak ada yang terlewat hari ini, berikan apresiasi atas kelancaran tilawah 3 waktunya di daily_tip.
- Jangan menambahkan teks di luar objek JSON.`;

const PRAYER_LABELS: Record<string, string> = {
  pagi: 'Pagi', siang: 'Siang', sore: 'Sore/Malam', extra: 'Fastabiqul Khairat',
};

function buildCoachFallback(
  userName: string,
  dailyMissed: string[],
  weeklyMissed: Record<string, number>,
  weakestTime: string,
  hutangSanksi: number,
): CoachAnalysis {
  const weakestLabel = PRAYER_LABELS[weakestTime] ?? weakestTime;
  const missedCount = weeklyMissed[weakestTime] ?? 0;
  return {
    summary: `${userName || 'Pengguna'} sedang menjaga konsistensi tilawah dengan beberapa area yang bisa diperbaiki.`,
    daily_missed: dailyMissed,
    daily_tip: dailyMissed.length > 0
      ? `Ambil 5 menit sekarang untuk tilawah 1-2 ayat sebagai pengganti waktu yang terlewat. Lebih utama sedikit daripada tidak sama sekali.`
      : `Syukran! Hari ini kelancaran tilawah 3 waktunya terjaga. Pertahankan istiqamah ini!`,
    weakest_time: weakestTime,
    weekly_missed_count: missedCount,
    weekly_analysis: `Dalam 7 hari terakhir, waktu ${weakestLabel} adalah titik terlemahmu dengan ${missedCount}x terlewat. Pola ini biasanya terkait rutinitas yang padat di waktu tersebut. Hutang sanksi: ${hutangSanksi}.`,
    solutions: [
      `Sediakan Al-Qur'an kecil atau aplikasi di HP agar mudah dibaca di sela waktu ${weakestLabel}.`,
      `Pasang alarm pengingat 5 menit setelah waktu ${weakestLabel} agar tilawah tidak terlewat.`,
      `Mulai dengan target ringan di waktu ${weakestLabel}: 1-2 ayat saja lebih utama daripada tidak sama sekali.`,
    ],
  };
}

function computeCoachData(logs: TilawahLog[]) {
  const today = todayISODate();
  const todayDone = new Set<string>();
  for (const log of logs) {
    if (log.log_date === today && !log.is_recovery) {
      todayDone.add((log.prayer_time || '').toLowerCase());
    }
  }
  const allPrayers = ['pagi', 'siang', 'sore'];
  const dailyMissed = allPrayers.filter((p) => !todayDone.has(p)).map((p) => PRAYER_LABELS[p]);

  const weekAgo = getNow();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const dayPrayers = new Map<string, Set<string>>();
  for (const log of logs) {
    if (log.log_date && log.log_date >= weekAgoStr && !log.is_recovery) {
      if (!dayPrayers.has(log.log_date)) dayPrayers.set(log.log_date, new Set());
      dayPrayers.get(log.log_date)!.add((log.prayer_time || '').toLowerCase());
    }
  }
  const weeklyMissed: Record<string, number> = { pagi: 0, siang: 0, sore: 0 };
  for (let i = 0; i < 7; i++) {
    const d = getNow();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const done = dayPrayers.get(ds);
    for (const p of allPrayers) {
      if (!done || !done.has(p)) weeklyMissed[p]++;
    }
  }
  const sortedByMissed = Object.entries(weeklyMissed).sort((a, b) => b[1] - a[1]);
  const weakestTime = sortedByMissed[0][1] > 0 ? sortedByMissed[0][0] : 'merata';
  return { dailyMissed, weeklyMissed, weakestTime };
}

export async function fetchCoachAnalysis(
  logs: TilawahLog[],
  userName: string,
  targetMinutes: number,
  hutangSanksi: number = 0
): Promise<CoachAnalysis> {
  const { dailyMissed, weeklyMissed, weakestTime } = computeCoachData(logs);

  // 1) Try the edge function first
  try {
    const res = await fetch(edgeUrl('ai-coach'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ logs, user_name: userName, target_minutes: targetMinutes, hutang_sanksi: hutangSanksi }),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data?.error && Array.isArray(data?.solutions) && data.solutions.length > 0) {
        return {
          summary: data.summary ?? '',
          daily_missed: Array.isArray(data.daily_missed) ? data.daily_missed : [],
          daily_tip: data.daily_tip ?? '',
          weakest_time: data.weakest_time ?? 'merata',
          weekly_missed_count: data.weekly_missed_count ?? 0,
          weekly_analysis: data.weekly_analysis ?? '',
          solutions: data.solutions,
        };
      }
      if (data?.error) console.warn('[ai-coach] edge error:', data.error);
    } else {
      console.warn('[ai-coach] edge HTTP', res.status);
    }
  } catch (err) {
    console.warn('[ai-coach] edge unreachable:', err);
  }

  // 2) Frontend direct fallback
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('[ai-coach] No Gemini API key found in env. Using computed fallback.');
    return buildCoachFallback(userName, dailyMissed, weeklyMissed, weakestTime, hutangSanksi);
  }

  const today = todayISODate();
  const allPrayers = ['pagi', 'siang', 'sore'];
  const todayDone = new Set<string>();
  for (const log of logs) {
    if (log.log_date === today && !log.is_recovery) todayDone.add((log.prayer_time || '').toLowerCase());
  }
  const byTime: Record<string, number> = { pagi: 0, siang: 0, sore: 0 };
  let totalMinutes = 0;
  const daysActive = new Set<string>();
  for (const log of logs) {
    const t = (log.prayer_time || '').toLowerCase();
    if (byTime[t] != null) byTime[t] += 1;
    totalMinutes += log.duration_minutes || 10;
    if (log.log_date) daysActive.add(log.log_date);
  }

  const userPrompt = `Data log tilawah pengguna "${userName || 'Pengajar/Pemuda'}":

=== DATA HARI INI ===
- Tanggal: ${today}
- Waktu yang TERLEWAT hari ini: ${dailyMissed.length > 0 ? dailyMissed.join(', ') : 'Tidak ada (semua 3 waktu selesai)'}
- Waktu yang SELESAI hari ini: ${allPrayers.filter((p) => todayDone.has(p)).map((p) => PRAYER_LABELS[p]).join(', ') || 'Belum ada'}

=== DATA KUMULATIF 7 HARI TERAKHIR ===
- Target harian: ${targetMinutes || 50} menit
- Hari aktif (ada log): ${daysActive.size}/7
- Total menit: ${totalMinutes}
- Distribusi TERLEWAT per waktu (7 hari): ${Object.entries(weeklyMissed).map(([k, v]) => `${PRAYER_LABELS[k]}=${v}x`).join(', ')}
- Waktu paling lemah: ${PRAYER_LABELS[weakestTime] ?? weakestTime} (${weeklyMissed[weakestTime] ?? 0}x terlewat)
- Hutang sanksi saat ini: ${hutangSanksi}

=== INSTRUKSI ANALISIS ===
a. Evaluasi Harian (Hari Ini): sebutkan shalat yang terlewat hari ini + 1 tips pemulihan.
b. Evaluasi Kumulatif Mingguan: deteksi waktu paling sering terlewat + akar masalah.
c. 3 Solusi Taktis & Konkrit spesifik untuk waktu ${PRAYER_LABELS[weakestTime] ?? weakestTime}.

Output WAJIB JSON sesuai format, tanpa teks di luar JSON.`;

  const { text, error } = await callGeminiDirect(apiKey, COACH_SYSTEM, userPrompt, {
    temperature: 0.7, maxOutputTokens: 800, jsonMode: true,
  });

  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.solutions)) {
        return {
          summary: parsed.summary ?? '',
          daily_missed: Array.isArray(parsed.daily_missed) ? parsed.daily_missed : [],
          daily_tip: parsed.daily_tip ?? '',
          weakest_time: parsed.weakest_time ?? 'merata',
          weekly_missed_count: parsed.weekly_missed_count ?? 0,
          weekly_analysis: parsed.weekly_analysis ?? '',
          solutions: parsed.solutions,
        };
      }
    } catch {
      const match = text?.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed && Array.isArray(parsed.solutions)) {
            return {
              summary: parsed.summary ?? '',
              daily_missed: Array.isArray(parsed.daily_missed) ? parsed.daily_missed : [],
              daily_tip: parsed.daily_tip ?? '',
              weakest_time: parsed.weakest_time ?? 'merata',
              weekly_missed_count: parsed.weekly_missed_count ?? 0,
              weekly_analysis: parsed.weekly_analysis ?? '',
              solutions: parsed.solutions,
            };
          }
        } catch {
          console.error('[ai-coach] JSON parse failed:', text.slice(0, 200));
        }
      }
    }
  }

  console.error('[ai-coach] direct Gemini failed:', error);
  return buildCoachFallback(userName, dailyMissed, weeklyMissed, weakestTime, hutangSanksi);
}

export { supabase };
