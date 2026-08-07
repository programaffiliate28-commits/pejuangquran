import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Kamu adalah seorang ahli tafsir Al-Qur'an yang ramah, menenangkan, dan bijaksana, melayani komunitas pemuda masjid di Indonesia.

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

const FALLBACK = (surah: string, ayat: string) =>
  `Membaca ${surah} ayat ${ayat} mengingatkan kita untuk senantiasa bersyukur dan bersabar dalam menjalani hari. Setiap ayat Al-Qur'an adalah cahaya yang menenangkan hati di tengah kesibukan dunia. Semoga bacaanmu hari ini menjadi amal jariyah yang berkah.`;

const MODELS = ["gemini-flash-latest", "gemini-2.0-flash"];

async function callGemini(apiKey: string, userPrompt: string): Promise<{ text: string | null; error: string | null }> {
  const errors: string[] = [];
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
            generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
          }),
        },
      );

      if (res.status === 404) {
        errors.push(`${model}: 404 model tidak ditemukan`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Gemini ${model} error:`, errText);
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return { text, error: null };

      errors.push(`${model}: respons kosong`);
    } catch (err) {
      console.error(`Gemini ${model} fetch error:`, err);
      errors.push(`${model}: gagal koneksi`);
    }
  }
  return { text: null, error: `Semua model gagal. Coba lagi nanti. (Detail: ${errors.join("; ")})` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { surah_name, ayat_start, ayat_end, juz } = await req.json();

    if (!surah_name || ayat_start == null) {
      return new Response(
        JSON.stringify({ error: "surah_name dan ayat_start wajib diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey =
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("VITE_GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY");

    const ayatRange = ayat_end && ayat_end !== ayat_start
      ? `${ayat_start}-${ayat_end}`
      : `${ayat_start}`;

    if (!apiKey) {
      console.warn("GEMINI_API_KEY not set — returning static fallback");
      return new Response(
        JSON.stringify({ tadabbur: FALLBACK(surah_name, ayatRange) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userPrompt = `Berikan tadabbur dan refleksi singkat (2-3 kalimat) khusus berdasarkan kandungan makna asli dari Surat ${surah_name} ayat ${ayatRange} (Juz ${juz}).

Jangan gunakan kalimat umum atau template. Bahas poin spiritual spesifik dari ayat tersebut secara hangat dan menenangkan, lalu kaitkan dengan kehidupan sehari-hari.

Ingat: setiap surah dan ayat memiliki pesan unik. Refleksi untuk ${surah_name} ayat ${ayatRange} harus berbeda dari refleksi surah lain.`;

    const { text, error } = await callGemini(apiKey, userPrompt);

    if (error) {
      return new Response(
        JSON.stringify({ error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ tadabbur: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-tadabbur error:", err);
    return new Response(
      JSON.stringify({ error: "Terjadi kesalahan saat memproses tadabbur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
