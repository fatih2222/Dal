# Zorluk puanı ölçümü

`run.html`, Dal'ın metin zorluk puanını seviyesi bilinen metinlerle karşılaştırır. API'ye istek göndermez.

## Veri

OneStopEnglish derlemi (Vajjala ve Lučić 2018, CC BY-SA 4.0): 189 haberin Elementary, Intermediate ve Advanced sürümleri.
Veri depoya eklenmez (`bench/data/` gitignore'da). İndirmek için proje klasöründe:

```
git clone --depth 1 https://github.com/nishkalavallabhi/OneStopEnglishCorpus.git bench/data/ose
```

Sonra `bench/data/ose-manifest.json` dosyası üç seviyesi de olan haberleri listeler (oluşturma komutu sohbet geçmişinde; dosya adları `X-ele.txt`, `X-int.txt`, `X-adv.txt`).

## Çalıştırma

Yerel sunucuyu başlat (`py -m http.server 8765`), tarayıcıda `http://localhost:8765/bench/run.html` aç.

## Ölçütler

- **Spearman**: puan ile seviye (1, 2, 3) arasındaki sıra korelasyonu. 1 kusursuz.
- **Çift doğruluğu**: aynı haberin iki sürümünden zor olanın daha yüksek puan alma oranı.
- **Üçlü doğruluğu**: üç sürümün tam doğru sıralanma oranı.
