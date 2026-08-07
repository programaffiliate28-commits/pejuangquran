import { SURAH_LIST } from './constants';
import type { TadabburResponse } from './types';

interface EquranTafsirItem {
  ayat: number;
  teks: string;
}

interface EquranTafsirResponse {
  code: number;
  message: string;
  data: {
    nomor: number;
    nama: string;
    namaLatin: string;
    jumlahAyat: number;
    tafsir: EquranTafsirItem[];
  };
}

// Resolver fleksibel: Bisa terima nama Surah, angka, atau teks "QS. Al-Baqarah"
function resolveSurahNumber(input: string | number): number {
  if (typeof input === 'number') return input;
  if (!input) return 1;

  // Jika input berupa string angka "2" atau "02"
  const parsedNum = parseInt(input.trim(), 10);
  if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 114) {
    return parsedNum;
  }

  // Bersihkan teks (hapus "QS.", "Surah", spasi, dan karakter unik)
  const cleanInput = input
    .toLowerCase()
    .replace(/^(qs\.?|surah)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  // Cari di SURAH_LIST
  const foundIdx = SURAH_LIST.findIndex((s) => {
    const cleanName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLatin = ((s as any).latin || (s as any).namaLatin || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanName === cleanInput || cleanLatin === cleanInput || cleanName.includes(cleanInput);
  });

  // Default ke Surah 1 (Al-Fatihah) jika tidak ketemu agar tidak error/crash
  return foundIdx >= 0 ? foundIdx + 1 : 1; 
}

function extractFirstSentence(text: string): string {
  if (!text) return '';
  // Bersihkan tag HTML atau footnote jika ada, hilangkan spasi ganda
  const cleaned = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([^.!?]*[.!?])/);
  if (match && match[1].length > 15) {
    return match[1].trim();
  }
  return cleaned.length > 160 ? cleaned.slice(0, 157).trim() + '...' : cleaned;
}

function pickTafsirItems(
  items: EquranTafsirItem[],
  ayatStart: number,
  ayatEnd: number
): EquranTafsirItem[] {
  const inRange = items.filter((item) => item.ayat >= ayatStart && item.ayat <= ayatEnd);
  
  if (inRange.length === 0) return items.slice(0, 3);
  if (inRange.length <= 3) return inRange;

  const mid = Math.floor(inRange.length / 2);
  const picked = [inRange[0], inRange[mid], inRange[inRange.length - 1]];

  // Hapus duplikat ayat
  return picked.filter((item, index, self) => 
    index === self.findIndex((t) => t.ayat === item.ayat)
  );
}

function formatTadabbur(picked: EquranTafsirItem[]): string {
  const sentences = picked
    .map((item) => extractFirstSentence(item.teks))
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return [
      '💡 Pesan Utama: Senantiasa merenungkan petunjuk dan hikmah di setiap ayat Al-Qur\'an.',
      '🌱 Pelajaran Ayat: Menjadikan bacaan harian sebagai sarana pembersih jiwa dan penenang hati.',
      '✨ Pengingat: Istiqamah menjaga tilawah membawa keberkahan dalam kehidupan.'
    ].join('\n');
  }

  const labels = ['💡 Pesan Utama', '🌱 Pelajaran Ayat', '✨ Pengingat'];
  
  // Lengkapi slot jika kalimat hasil ekstraksi kurang dari 3
  while (sentences.length < 3) {
    sentences.push(sentences[sentences.length - 1] || 'Mengamalkan pesan kebaikan Al-Qur\'an dalam kehidupan.');
  }

  return sentences
    .slice(0, 3)
    .map((s, i) => `${labels[i]}: ${s}`)
    .join('\n');
}

export async function fetchKemenagTadabbur(
  surahStart: string | number,
  ayatStart: number,
  ayatEnd: number,
  surahEnd?: string | number
): Promise<TadabburResponse> {
  const startNum = resolveSurahNumber(surahStart);
  const endNum = surahEnd ? resolveSurahNumber(surahEnd) : startNum;

  try {
    const surahNumbers = (endNum !== startNum && endNum > 0) ? [startNum, endNum] : [startNum];
    
    const responses = await Promise.all(
      surahNumbers.map(async (num) => {
        const res = await fetch(`https://equran.id/api/v2/tafsir/${num}`);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const json = (await res.json()) as EquranTafsirResponse;
        return json.data; // AMBIL PROPERTI DATA
      })
    );

    let picked: EquranTafsirItem[] = [];

    if (responses.length === 1) {
      picked = pickTafsirItems(responses[0]?.tafsir ?? [], ayatStart, ayatEnd);
    } else {
      const startTafsir = responses[0]?.tafsir ?? [];
      const endTafsir = responses[1]?.tafsir ?? [];
      
      const fromStart = startTafsir.filter((t) => t.ayat >= ayatStart);
      const fromEnd = endTafsir.filter((t) => t.ayat <= ayatEnd);
      const combined = [...fromStart, ...fromEnd];

      picked = pickTafsirItems(combined, 1, 999);
    }

    const result = formatTadabbur(picked);
    return { tadabbur: result };

  } catch (err) {
    console.warn('[Kemenag Tafsir] Fetch failed:', err);
    return { 
      error: 'Gagal memuat tafsir Kemenag. Periksa koneksi internet lalu coba lagi.' 
    };
  }
}