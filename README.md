# mahyong-about

Cloudflare Worker yang melayani dua hal untuk aplikasi Android **Mahyong**:

1. **`GET /config`** — endpoint yang dipanggil `AboutUrlResolver` di app. Membalas satu baris teks
   berisi satu URL `https://…`, dipilih berdasarkan negara pemanggil (header `CF-IPCountry`, diisi
   otomatis oleh Cloudflare di setiap request — tidak perlu produk tambahan apa pun).
   - Negara `ID` → `ABOUT_URL_ID` (kalau tidak di-set, fallback ke halaman `/` di Worker ini
     sendiri).
   - Negara lain → `ABOUT_URL_DEFAULT` (halaman non-Indonesia, di-host di luar Worker ini).
   - `?cc=XX` bisa dipakai untuk menimpa deteksi negara secara manual saat verifikasi
     (`curl "https://…/config?cc=ID"`).
   - Responsnya **selalu** `Cache-Control: no-store` — jangan diubah. Config ini sengaja tidak
     boleh basi di cache mana pun, termasuk cache Cloudflare sendiri.
2. **Static assets** (`public/`) — halaman About berbahasa Indonesia (`index.html`), juga
   `no-store` lewat `public/_headers` supaya isinya tidak pernah ditampilkan basi di WebView app.

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

Ini seluruh maksud dari setup ini — mengubah `vars.ABOUT_URL_DEFAULT` di `wrangler.jsonc` (dan/atau
menambah `ABOUT_URL_ID`), lalu:

```sh
npm run deploy
```

Perubahan berlaku instan untuk request berikutnya (tidak ada cache) — app akan mengambilnya
sendiri lewat polling latar (default tiap 60 detik saat layar About terbuka), tanpa perlu update
APK.

## Mengubah isi halaman About

Edit `public/index.html` langsung, lalu `npm run deploy`. **Jangan** menyebut nama, repositori,
atau proyek referensi apa pun yang dipakai untuk membangun game ini di halaman ini — halaman ini
murni deskripsi produk untuk pemain.

## Verifikasi cepat setelah deploy

```sh
curl -s "https://<worker>/config"                    # negara asli pemanggil
curl -s "https://<worker>/config?cc=ID"               # URL halaman Indonesia
curl -s "https://<worker>/config?cc=US"                # URL halaman default
curl -sI "https://<worker>/config" | grep -i cache-control     # -> no-store
curl -sI "https://<worker>/" | grep -i -e content-type -e cache-control
```

## Lokal

```sh
npm run dev
```

`wrangler dev` menjalankan Worker + assets secara lokal; `CF-IPCountry` tidak terisi otomatis di
lokal, jadi gunakan `?cc=XX` untuk menguji routing negara.
