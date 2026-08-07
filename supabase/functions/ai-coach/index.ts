import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Kamu adalah AI Personal Coach untuk konsistensi tilawah Al-Qur'an, melayani pemuda dan pengajar masjid di Indonesia.

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
  "weekly_analysis": "2-3 kalimat menjelaskan akar masalah psikologis/rutinitas kenapa waktu tersebut paling sering terlewat",
  "solutions": ["solusi taktis 1", "solusi taktis 2", "solusi taktis 3"]
}
- Setiap solusi harus konkret, ringkas (1-2 kalimat), dan bisa langsung dilakukan orang sibuk.
- Solusi harus spesifik terhadap waktu yang paling lemah, bukan saran generik.
- Jika tidak ada yang terlewat hari ini, berikan apresiasi atas kelancaran tilawah 3 waktunya di daily_tip.
- Jangan menambahkan teks di luar objek JSON.`;

const MODELS = ["gemini-flash-latest", "gemini-2.0-flash"];

const SLOT_LABELS: Record<string, string> = {
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore/Malam",
};

function buildFallback(
  userName: string,
  dailyMissed: string[],
  weeklyMissed: Record<string, number>,
  weakestTime: string,
  hutangSanksi: number,
): Record<string, unknown> {
  const weakestLabel = SLOT_LABELS[weakestTime] ?? weakestTime;
  const missedCount = weeklyMissed[weakestTime] ?? 0;
  return {
    summary: `${userName || "Pengguna"} sedang menjaga konsistensi tilawah dengan beberapa area yang bisa diperbaiki.`,
    daily_missed: dailyMissed,
    daily_tip: dailyMissed.length > 0
      ? `Ambil 5 menit sekarang untuk tilawah 1-2 ayat sebagai pengganti waktu yang terlewat. Lebih utama sedikit daripada tidak sama sekali.`
      : `Syukran! Hari ini kelancaran tilawah 3 waktunya terjaga. Pertahankan istiqamah ini!`,
    weakest_time: weakestTime,
    weekly_missed_count: missedCount,
    weekly_analysis: `Dalam 7 hari terakhir, waktu ${weakestLabel} adalah titik terlemahmu dengan ${missedCount}x terlewat. Pola ini biasanya terkait rutinitas yang padat di waktu tersebut. Hutang sanksi saat ini: ${hutangSanksi}.`,
    solutions: [
      `Sediakan Al-Qur'an kecil atau aplikasi di HP agar mudah dibaca di sela waktu ${weakestLabel}.`,
      `Pasang alarm pengingat 5 menit setelah waktu ${weakestLabel} agar tilawah tidak terlewat.`,
      `Mulai dengan target ringan di waktu ${weakestLabel}: 1-2 ayat saja lebih utama daripada tidak sama sekali.`,
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { logs = [], user_name, target_minutes, hutang_sanksi } = await req.json();

    if (!Array.isArray(logs)) {
      return new Response(
        JSON.stringify({ error: "logs wajib berupa array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayDone = new Set<string>();
    for (const log of logs) {
      if (log.log_date === today && !log.is_recovery) {
        todayDone.add((log.prayer_time || "").toLowerCase());
      }
    }
    const allSlots = ["pagi", "siang", "sore"];
    const dailyMissed = allSlots
      .filter((p) => !todayDone.has(p))
      .map((p) => SLOT_LABELS[p]);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    const dayPrayers = new Map<string, Set<string>>();
    for (const log of logs) {
      if (log.log_date && log.log_date >= weekAgoStr && !log.is_recovery) {
        if (!dayPrayers.has(log.log_date)) dayPrayers.set(log.log_date, new Set());
        dayPrayers.get(log.log_date)!.add((log.prayer_time || "").toLowerCase());
      }
    }

    const weeklyMissed: Record<string, number> = { pagi: 0, siang: 0, sore: 0 };
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const done = dayPrayers.get(ds);
      for (const p of allSlots) {
        if (!done || !done.has(p)) weeklyMissed[p]++;
      }
    }

    const sortedByMissed = Object.entries(weeklyMissed).sort((a, b) => b[1] - a[1]);
    const weakestTime = sortedByMissed[0][1] > 0 ? sortedByMissed[0][0] : "merata";
    const weeklyMissedCount = sortedByMissed[0][1];

    const byTime: Record<string, number> = { pagi: 0, siang: 0, sore: 0, extra: 0 };
    let totalMinutes = 0;
    const daysActive = new Set<string>();
    for (const log of logs) {
      const t = (log.prayer_time || "").toLowerCase();
      if (byTime[t] != null) byTime[t] += 1;
      totalMinutes += log.duration_minutes || 10;
      if (log.log_date) daysActive.add(log.log_date);
    }

    const apiKey =
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("VITE_GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY");

    if (!apiKey) {
      console.warn("API Key tidak ditemukan di environment. Menggunakan fallback data.");
      return new Response(
        JSON.stringify(buildFallback(user_name, dailyMissed, weeklyMissed, weakestTime, hutang_sanksi || 0)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dailyMissedStr = dailyMissed.length > 0 ? dailyMissed.join(", ") : "Tidak ada (semua 3 waktu selesai)";
    const weeklyMissedStr = Object.entries(weeklyMissed)
      .map(([k, v]) => `${SLOT_LABELS[k]}=${v}x terlewat`)
      .join(", ");

    const userPrompt = `Data log tilawah pengguna "${user_name || "Pengajar/Pemuda"}":

=== DATA HARI INI ===
- Tanggal: ${today}
- Waktu yang TERLEWAT hari ini: ${dailyMissedStr}
- Waktu yang SELESAI hari ini: ${allSlots.filter((p) => todayDone.has(p)).map((p) => SLOT_LABELS[p]).join(", ") || "Belum ada"}

=== DATA KUMULATIF 7 HARI TERAKHIR ===
- Target harian: ${target_minutes || 50} menit
- Hari aktif (ada log): ${daysActive.size}/7
- Total log minggu ini: ${logs.filter((l) => !l.is_recovery).length}
- Total menit: ${totalMinutes}
- Distribusi selesai per waktu: Pagi=${byTime.pagi}, Siang=${byTime.siang}, Sore=${byTime.sore}, Extra=${byTime.extra}
- Distribusi TERLEWAT per waktu (7 hari): ${weeklyMissedStr}
- Waktu paling lemah: ${SLOT_LABELS[weakestTime] ?? weakestTime} (${weeklyMissedCount}x terlewat)
- Hutang sanksi saat ini: ${hutang_sanksi || 0}

=== INSTRUKSI ANALISIS ===
a. Evaluasi Harian (Hari Ini):
   - Sebutkan secara spesifik waktu mana saja yang TERLEWAT hari ini.
   - Jika tidak ada yang terlewat: berikan apresiasi atas kelancaran tilawah 3 waktunya.
   - Berikan 1 tips pemulihan cepat (mikro-habit) untuk hari ini.

b. Evaluasi Kumulatif Mingguan (Pola 7 Hari):
   - Deteksi pola: "Kamu paling sering terlewat di waktu [Nama Waktu] dengan [N]x terlewat dalam 7 hari."
   - Jelaskan akar masalah psikologis/rutinitas.
   - Jika hutang sanksi > 0, sebutkan dan sarankan mencicil tugas recovery.

c. 3 Solusi Taktis & Konkrit:
   - Berikan 3 langkah aksi nyata untuk memperbaiki waktu tilawah yang paling sering terlewat.
   - Solusi harus spesifik untuk waktu ${SLOT_LABELS[weakestTime] ?? weakestTime}.

Output WAJIB JSON sesuai format yang ditentukan di system instruction.`;

    let parsed: Record<string, unknown> | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000,
                responseMimeType: "application/json",
              },
            }),
          },
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Gemini API Error (${model} - Status ${res.status}):`, errText);
          continue;
        }

        const data = await res.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        rawText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

        try {
          parsed = JSON.parse(rawText);
        } catch {
          const match = rawText.match(/\{[\s\S]*\}/);
          if (match) {
            try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
          }
        }

        if (parsed && Array.isArray(parsed.solutions)) {
          break;
        }
      } catch (err) {
        console.error(`Gemini Fetch Error (${model}):`, err);
      }
    }

    if (parsed && Array.isArray(parsed.solutions)) {
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(buildFallback(user_name, dailyMissed, weeklyMissed, weakestTime, hutang_sanksi || 0)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-coach error:", err);
    return new Response(
      JSON.stringify({ error: "Terjadi kesalahan saat menganalisis progress" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
