import { AVATAR_URL_MAX_LENGTH } from './progressSync';

export interface PresetAvatarSpec {
  id: string;
  label: string;
  kanji: string;
  bgFrom: string;
  bgTo: string;
}

export const PRESET_AVATARS: PresetAvatarSpec[] = [
  { id: 'indigo-sun', label: 'Matahari', kanji: '日', bgFrom: '#4f46e5', bgTo: '#3730a3' },
  { id: 'sakura', label: 'Sakura', kanji: '桜', bgFrom: '#db2777', bgTo: '#9d174d' },
  { id: 'emerald-mt', label: 'Gunung', kanji: '山', bgFrom: '#059669', bgTo: '#065f46' },
  { id: 'amber-moon', label: 'Bulan', kanji: '月', bgFrom: '#d97706', bgTo: '#92400e' },
  { id: 'sky-wave', label: 'Ombak', kanji: '波', bgFrom: '#0284c7', bgTo: '#075985' },
  { id: 'slate-star', label: 'Bintang', kanji: '星', bgFrom: '#334155', bgTo: '#0f172a' },
];

export function renderPresetKanjiAvatar(spec: PresetAvatarSpec): string {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser tidak mendukung pembuatan gambar avatar.');
  }

  const grad = ctx.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, spec.bgFrom);
  grad.addColorStop(1, spec.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 96, 96);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 48px "Noto Sans JP", "Hiragino Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.kanji, 48, 50);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Center-crops and compresses an uploaded image file to a 96x96 JPEG data URL
 * guaranteed to fit inside the Firestore blueprint limit (< 20,000 chars).
 */
export async function compressAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih file gambar (JPG, PNG, atau WebP).');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran file gambar terlalu besar (maksimal 5 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      el.src = objectUrl;
    });

    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!side) {
      throw new Error('Dimensi gambar tidak valid.');
    }
    const sx = ((img.naturalWidth || img.width) - side) / 2;
    const sy = ((img.naturalHeight || img.height) - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser tidak mendukung pemrosesan gambar.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 96, 96);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 96, 96);

    for (const quality of [0.82, 0.68, 0.52, 0.38]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= AVATAR_URL_MAX_LENGTH) {
        return dataUrl;
      }
    }

    throw new Error('Gambar terkompresi masih melebihi batas ukuran profil.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
