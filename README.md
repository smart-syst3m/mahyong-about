# mahyong-about

Cloudflare Worker yang melayani dua hal untuk aplikasi Android **Mahyong**:

1. **`GET /config`** — endpoint yang dipanggil `AboutUrlResolver` di app. Membalas satu baris teks
   berisi satu URL `https://…`, dipilih berdasarkan negara yang **dikirim eksplisit oleh app**
   lewat query param `?cc=XX` — bukan lagi header `CF-IPCountry`. Worker ini tidak lagi menebak
   negara sama sekali; app-lah yang menentukannya (lihat `CountryProvider.kt` di sisi app: sumber
   IP yang di-pin ke satu stack IPv4, dengan fallback SIM/timezone kalau semua sumber IP gagal).
   `CF-IPCountry` sengaja ditinggalkan sebagai sumber - VPN yang hanya men-tunnel satu stack IP
   membuatnya melompat-lompat antar-request dalam satu sesi yang sama, jadi tidak andal untuk
   penentuan negara sendirian.
   - **Butuh header `X-Mahyong-Token`** yang cocok dengan secret `APP_TOKEN` — tanpa itu (atau kalau
     nilainya salah) dibalas `403`. Ini **bukan keamanan sungguhan**: token yang sama tertanam
     (ter-obfuscate) di app Android-nya (`APP_ACCESS_TOKEN` di `AboutConfig.kt`), jadi siapa pun
     yang men-decompile APK bisa mendapatkannya. Gunanya cuma menyaring bot/scraper acak yang
     kebetulan menemukan URL ini, bukan menahan penyerang yang menyasar spesifik. **Fail-closed**:
     kalau secret `APP_TOKEN` belum pernah di-set, endpoint ini menolak semua orang, termasuk app.
   - `cc=<CC>` → `env.ABOUT_URL_<CC>` kalau var itu ada (mis. `ABOUT_URL_ID` untuk Indonesia, di-host
     di luar Worker ini) — negara baru cukup tambah var baru, tanpa ubah kode.
   - `cc` kosong/tidak dikenali/tanpa var yang cocok → halaman `/` di Worker ini sendiri
     (`public/index.html`), selalu — default yang aman, bukan `500`, supaya `cc` yang
     hilang/rusak tidak pernah mematahkan halaman About.
   - Responsnya **selalu** `Cache-Control: no-store` — jangan diubah. Config ini sengaja tidak
     boleh basi di cache mana pun, termasuk cache Cloudflare sendiri.
2. **Static assets** (`public/`) — `index.html` (ditulis berbahasa Indonesia), sekarang disajikan
   ke pengguna **non-Indonesia** per pemetaan di atas. Belum diterjemahkan/disesuaikan untuk
   audiens itu - sengaja di luar scope perubahan pemetaan ini. Juga `no-store` lewat
   `public/_headers` supaya isinya tidak pernah ditampilkan basi di WebView app.

## Deploy

```sh
npm install
npx wrangler login       # sekali saja per mesin
npm run deploy
```

Setelah deploy pertama, Wrangler mencetak URL `https://mahyong-about.<akun>.workers.dev`. Berikan
URL itu (plus URL custom domain kalau nanti dipasang) ke sisi app supaya dimasukkan ke
`ABOUT_CONFIG_SOURCES` di `AboutConfig.kt`.

## Mengubah URL tanpa update app

Ini seluruh maksud dari setup ini — mengubah `vars.ABOUT_URL_ID` di `wrangler.jsonc`, lalu:

```sh
npm run deploy
```

Perubahan berlaku instan untuk request berikutnya (tidak ada cache) — app akan mengambilnya
sendiri lewat polling latar (default tiap 5 menit saat layar About terbuka), tanpa perlu update
APK.

## Mengubah isi halaman About

Edit `public/index.html` langsung, lalu `npm run deploy`. **Jangan** menyebut nama, repositori,
atau proyek referensi apa pun yang dipakai untuk membangun game ini di halaman ini — halaman ini
murni deskripsi produk untuk pemain.

## Set token akses app (`APP_TOKEN`) — sekali saja

`/config` menolak semua request yang tidak membawa header `X-Mahyong-Token` yang cocok. Set
plaintext-nya sebagai **secret** (bukan `vars` — jangan pernah ditaruh di `wrangler.jsonc` atau
commit ke git):

```sh
npx wrangler secret put APP_TOKEN
# tempel plaintext token yang sama dengan APP_ACCESS_TOKEN di app (AboutConfig.kt) saat diminta
```

Atau lewat dashboard: Workers & Pages → mahyong-about → Settings → Variables and Secrets → Add →
tipe **Secret**, nama `APP_TOKEN`. Sekali di-set, nilainya bertahan lintas deploy Workers Builds
berikutnya (beda dari `vars`, yang di-reset tiap `wrangler.jsonc` ter-redeploy dari git) — tidak
perlu diulang tiap push.

Kalau token di app diganti (rotasi), ulangi perintah di atas dengan nilai baru, dan pastikan APK
yang beredar sudah memakai nilai yang sama - token lama otomatis berhenti berfungsi begitu secret
diganti.

## Verifikasi cepat setelah deploy

```sh
curl -s -o /dev/null -w "%{http_code}\n" "https://<worker>/config"           # -> 403 (tanpa token)
curl -s -H "X-Mahyong-Token: <token asli>" "https://<worker>/config"         # cc kosong -> halaman Worker sendiri
curl -s -H "X-Mahyong-Token: <token asli>" "https://<worker>/config?cc=ID"   # URL halaman Indonesia (ABOUT_URL_ID)
curl -s -H "X-Mahyong-Token: <token asli>" "https://<worker>/config?cc=US"   # halaman Worker sendiri (https://<worker>/)
curl -sI -H "X-Mahyong-Token: <token asli>" "https://<worker>/config" | grep -i cache-control  # -> no-store
curl -sI "https://<worker>/" | grep -i -e content-type -e cache-control   # root tidak digerbangi token
```

## Lokal

```sh
npm run dev
```

`wrangler dev` menjalankan Worker + assets secara lokal; karena negara sekarang selalu dikirim
lewat `?cc=XX` oleh app (bukan lagi dibaca dari `CF-IPCountry`), pengujian lokal maupun deployed
sama-sama pakai `?cc=XX` untuk menguji routing negara.
