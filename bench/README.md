# Zorluk puanı ölçümü ve kelime verisi

API'ye istek gönderilmez. İndirilen veriler `bench/data/` klasöründe durur ve depoya eklenmez.

## Ölçüm: `run.html`

Dal'ın metin zorluk puanını seviyesi bilinen metinlerle karşılaştırır: OneStopEnglish derlemi (Vajjala ve Lučić 2018, CC BY-SA 4.0), 189 haberin Elementary, Intermediate ve Advanced sürümleri.

```
git clone --depth 1 https://github.com/nishkalavallabhi/OneStopEnglishCorpus.git bench/data/ose
```

`bench/data/ose-manifest.json` üç seviyesi de olan haberleri listeler (`X-ele.txt`, `X-int.txt`, `X-adv.txt`).
Yerel sunucuda (`py -m http.server 8765`) `http://localhost:8765/bench/run.html` aç; sekme ekranda kalmalı.

Veri temizliği: Intermediate dosyalarındaki silinmiş kesme işaretleri ve bazı dosyalarda PDF'ten kalma kayıp
fi/fl/ff harfleri ölçümden önce onarılır.

- **Spearman**: puan ile seviye (1, 2, 3) arasındaki sıra korelasyonu.
- **Çift doğruluğu**: aynı haberin iki sürümünden zor olanın daha yüksek puan alma oranı.
- **Üçlü doğruluğu**: üç sürümün tam doğru sıralanma oranı.

| Sürüm | Spearman | Çift | Üçlü | Seviye içi SS (Ele/Int/Adv) |
|---|---|---|---|---|
| Başlangıç | 0,72 | 0,98 | 0,96 | 7,9 / 8,6 / 11,7 |
| Aşama 2 (sıklık yedeği, ortak kelimeler) | 0,73 | 0,98 | 0,95 | 6,8 / 6,5 / 8,7 |
| Aşama 3 (kalıplar) | 0,72 | 0,98 | 0,95 | 6,7 / 6,5 / 8,8 |
| Karşılaştırma: Flesch-Kincaid | 0,57 | 0,98 | 0,94 | |

Cümle uzunluğu deneyi (yarıda ayarla, öbür yarıda sına): kelime puanına 0,8 × ortalama cümle uzunluğu eklemek
Spearman'ı 0,67'den 0,70'e, üçlü doğruluğunu 0,94'ten 0,98'e çıkarıyor. Puanın anlamı korunsun diye cümle
uzunluğu ayrı gösterilir, puana katılmaz.

## Kelime verisini üretme

Kaynaklar:
- `bench/data/olp/`: github.com/openlanguageprofiles/olp-en-cefrj (CEFR-J 1.5: kaynak gösterilerek ücretsiz; Octanove C1/C2: CC BY-SA 4.0)
- `bench/data/wf/en.json`, `tr.json`: wordfreq 3.1 (CC BY-SA 4.0), `top_n_list(lang, 60000)` ve `zipf_frequency`

Betikler (çıktıları `index.html` içindeki ilgili sabitlere konur):
- `build_freq.py` → `FREQ_LV`: listede olmayan kelimelere sıklıktan seviye
- `build_cognates.py` → `COGNATES`: Türkçe ortak kelimeler (elle kontrol edilmiş)
- `build_phrases.py` → `PHRASES`: listelerdeki kalıp ifadeler
- `build_pseudowords.py` → `PSEUDO`: seviye testi için uydurma kelimeler (elle kontrol edilmiş)
