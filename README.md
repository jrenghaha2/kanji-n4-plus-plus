# N4 Kanji — Flashcard, Kuis ABC & Seri Buku Irodori

Aplikasi belajar bahasa Jepang berbasis React + TypeScript + Tailwind CSS + Firebase yang menggabungkan **500 kosakata kanji JLPT N4** dan **3 buku lengkap JF Irodori** (*Pemula*, *Dasar 1*, dan *Dasar 2*) dengan sinkronisasi cloud real-time.

## Fitur Utama

- **JLPT N4 (500 Kanji)**
  - Pembagian level *Easy* (210), *Medium* (200), dan *Hard* (90).
  - Flashcard interaktif (pintasan keyboard `Spasi`, `←/→`, `H`, `S`, `A`), mode kartu sulit, acak, dan sembunyikan hafal.
  - Daftar kosakata lengkap dengan pencarian, filter level/status, dan pelafalan audio Jepang (Web Speech API).
  - Kuis ABC 5 model (hingga 2.500 variasi soal dengan analisis morfologi & anti-ambiguitas jawaban ganda).
- **Seri Buku JF Irodori (100% Utuh, Bab 1–18)**
  - **Irodori Pemula (A1)**: 1.136 kosakata (`いろどり 入門`).
  - **Irodori Dasar 1 (A2)**: 1.067 kosakata (`いろどり 初級1`).
  - **Irodori Dasar 2 (A2)**: 1.288 kosakata (`いろどり 初級2`).
  - Pemilih bab fleksibel di menu kuis (Semua Bab, 1 bab, atau pilih beberapa bab sekaligus).
  - Tautan langsung ke daftar kosakata resmi PDF masing-masing buku.
- **Sinkronisasi Cloud & Backup Lokal**
  - Autentikasi Firebase (Google, GitHub, Email/Password dengan verifikasi email).
  - Sinkronisasi cloud otomatis & real-time (`onSnapshot`) untuk **JLPT N4** (`/users/{uid}`) dan **seluruh 3 buku Irodori** (`/users/{uid}/irodoriProgress/{bookId}`).
  - Penggabungan progres lokal → cloud secara otomatis saat masuk, serta ekspor/impor backup `.json`.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Aplikasi berjalan di `http://localhost:3000`.

## Skrip Pengujian & Validasi

```bash
# Type-check TypeScript
npm run lint

# Lint keamanan Firestore Security Rules
npm run lint:rules

# Jalankan seluruh unit test (morfologi, mesin kuis, Irodori, storage, aturan keamanan)
npm test

# Jalankan pengujian Firestore Security Rules langsung di Firebase Emulator (butuh Java 11+ & Firebase CLI)
npm run test:rules:emulator

# Build produksi
npm run build
```

## Deploy ke GitHub Pages

Workflow `.github/workflows/deploy.yml` otomatis menjalankan `npm run lint`, `npm run lint:rules`, `npm test`, lalu membangun bundle produksi dengan `VITE_BASE_PATH=/kanji-n4-plus-plus/` setiap kali push ke branch `main`.

> **Catatan Firebase Auth untuk GitHub Pages:**
> Pastikan domain GitHub Pages Anda (mis. `<username>.github.io`) sudah ditambahkan ke daftar **Authorized domains** di Firebase Console (`Authentication → Settings → Authorized domains`) agar login Google/GitHub berjalan lancar di URL produksi.
