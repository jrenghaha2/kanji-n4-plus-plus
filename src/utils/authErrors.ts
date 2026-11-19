export interface MappedAuthError {
  code: string;
  message: string;
  showConsoleHint: boolean;
}

export function mapFirebaseAuthError(err: unknown): MappedAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code,
        message: 'Jendela login ditutup sebelum selesai.',
        showConsoleHint: false,
      };
    case 'auth/popup-blocked':
      return {
        code,
        message: 'Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.',
        showConsoleHint: false,
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        message: 'Metode login ini belum diaktifkan di Firebase Console.',
        showConsoleHint: true,
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        message:
          'Email ini sudah terdaftar dengan metode login lain. Gunakan metode login sebelumnya.',
        showConsoleHint: false,
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        code,
        message: 'Email atau kata sandi tidak cocok.',
        showConsoleHint: false,
      };
    case 'auth/email-already-in-use':
      return {
        code,
        message: 'Email ini sudah terdaftar. Silakan masuk pada tab Masuk.',
        showConsoleHint: false,
      };
    case 'auth/weak-password':
      return {
        code,
        message: 'Kata sandi terlalu lemah (gunakan minimal 6 karakter).',
        showConsoleHint: false,
      };
    case 'auth/invalid-email':
      return {
        code,
        message: 'Format alamat email tidak valid.',
        showConsoleHint: false,
      };
    case 'auth/too-many-requests':
      return {
        code,
        message: 'Terlalu banyak percobaan. Tunggu beberapa saat sebelum mencoba lagi.',
        showConsoleHint: false,
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: 'Koneksi internet bermasalah. Periksa jaringan Anda lalu coba lagi.',
        showConsoleHint: false,
      };
    default:
      return {
        code,
        message: err instanceof Error ? err.message : 'Gagal memproses autentikasi.',
        showConsoleHint: false,
      };
  }
}
