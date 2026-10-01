# Mini Muhasebe

2026 hesap yılı için, tek işletmeli ve eğitim amaçlı muhasebe uygulaması. GitHub Pages üzerinde doğrudan çalışır; sunucu ve harici veritabanı gerektirmez.

## Özellikler

- Üç haneli ana hesaplarla fiş girişi, güncelleme ve silme
- Sistem tarafından artan sırayla atanan, kullanıcıya kapalı fiş numarası
- Kayıtlı fişler önce salt okunur açılır; Fişi Güncelle düzenlemeyi açar, Kaydet aynı fişi tarihini ve numarasını koruyarak kaydeder
- Fiş alanında bir saniyelik kayıt durum mesajı ve ardından otomatik yeni boş fiş
- Tüm şablonları listedeki sırayla doğrulayıp, Tarih alanından başlayarak her fişi bir gün sonra ve birer saniyelik kayıt bildirimiyle ayrı ayrı kaydetme
- Şablon Uygula sekmesinde şablonların tümünü veya seçilenlerini başlangıç tarihinden itibaren ardışık günlere kaydetme; bitiş tarihi seçimlere göre hesaplanır
- Fiş girişindeki Tüm Şablonu Uygula düğmesi Şablon Uygula sekmesini tüm seçenekler işaretli olarak açar ve fiş tarihini başlangıç tarihi yapar
- Borç ve alacak eşitliği, hesap kodu ve fiş numarası doğrulaması
- Borç ve alacak yazılırken otomatik binlik ayıracı; kuruş için virgül ve alan terk edilince iki ondalık basamak
- Fiş girişinde %1, %10 ve %20 KDV butonlarıyla borç satırının altına 191, alacak satırının altına 391 hesaplı satır ekleme
- Hesap kodu yazılırken girilen rakamlarla başlayan hesap önerileri
- Fiş girişinde kaydetme, dengeleme, alanlar arası geçiş ve hesap seçimi için klavye kısayolları
- Mizan, 6xx hareketlerinden gelir tablosu ve otomatik dönem sonucu içeren bilanço
- Bilançoda isteğe bağlı hesap grupları görünümü; sınıf ve iki haneli grup toplamları seçildiğinde ekranda ve baskıda gösterilir
- Tarih ve fiş numarasına göre sıralanan, fiş açıklamalarını gösteren yevmiye defteri; isteğe bağlı satır açıklamaları
- Yevmiye Defteri'nde Yazdır1 ile A4 tek sütun baskısı ve her sayfa altında önceki sayfalardan devreden Borç/Alacak toplamları
- Yevmiye Defteri'nde Yazdır2 ile A4 üzerinde sol sütundan sağ sütuna ilerleyen, fişleri bölmeden sayfalayan kompakt baskı ve her sayfa altında devreden Borç/Alacak toplamları; satır açıklamaları yalnızca "Satır Açıklaması Göster" seçiliyken yazdırılır
- Toplu Yazdır sekmesinde Yevmiye Defteri, Büyük Defter, Mizan, Gelir Tablosu ve Bilançoyu seçerek tek A4 dikey baskı akışında alma; Gelir Tablosu ile Bilanço sığarsa aynı sayfada yer alır
- Hareket görmüş hesapların fiş numaralı borç ve alacak hareketlerini, toplamlarını ve bakiyelerini gösteren Büyük Defter T hesapları
- Mizandaki hesaplar arasından seçim yaparak tarih sıralı hareketleri ve işleyen bakiyeyi gösteren Hesap Ekstresi
- Mizan satırına çift tıklayarak ilgili hesabın ekstresine geçiş
- Gelir tablosundaki hesap satırına çift tıklayarak ilgili hesabın ekstresine geçiş
- Bilançodaki hesap satırına çift tıklayarak ilgili hesabın ekstresine geçiş
- Hesap ekstresindeki hareket satırına çift tıklayarak ilgili kayıtlı fişi salt okunur açma
- Yevmiye defterindeki kayda çift tıklayarak ilgili kayıtlı fişi salt okunur açma
- Hesap planını CSV ile tamamen değiştirme; kayıtlı fişlerin kullandığı kodlar için koruma
- Tarayıcıda kalıcı saklama, JSON yedek indirme ve geri yükleme
- Ayarlarda işletme ünvanı; boşsa muhasebe.info, girilirse uygulama başlığı ve baskı sayfalarının sağ üst bilgisinde ünvan
- Ayarlar panelinden yedek indirme, geri yükleme ve onayla tüm fişleri silme; silme işleminde hesap planı korunur
- Masaüstü ve dar ekran düzeni

Başlangıç hesap planı `data/hesap-plani.csv` dosyasındadır. Kullanıcının sağladığı dosyadan alınmış 280 adet üç haneli hesap içerir. Uygulama başlangıçta fişsizdir.

## Fiş girişi kısayolları

- `Ctrl+S` / `⌘+S`: Düzenlenebilir fişi kaydeder; Kaydet düğmesi pasifse işlem yapmaz.
- `Ctrl+Enter` / `⌘+Enter`: Fişi Dengele işlemini çalıştırır.
- `Enter`: Tarih, fiş açıklaması ve fiş satırındaki alanlarda sırayla ilerler. Son satır doluysa yeni satır açar.
- `Tab`: Tarih → fiş açıklaması → ilk hesap alanı geçişini yapar. Hesap alanında seçilen hesabı onaylayıp Borç alanına geçer.
- `Ctrl` / `⌘` + yön tuşları: Fiş tablosunda komşu hücreye geçer.
- Hesap alanında `↑` / `↓`: Açık öneri listesindeki hesaplar arasında gezinir.
- Hesap alanında `Esc`: Öneri listesini kapatır ve önceki hesap seçimini geri getirir.

## Chrome'da açma

`index.html` dosyasına çift tıklayın veya Chrome'a sürükleyin. Uygulama doğrudan `file://` adresinden açılır. Bu açılışta kayıtlar Chrome'un bu yerel dosya için ayırdığı yerel depoda tutulur. Kaynak JavaScript dosyalarını veya başlangıç hesap planını değiştirirseniz, yayımlamadan önce `npm run build` ile `standalone.js` dosyasını yeniden oluşturun.

## Yerel web sunucusuyla çalıştırma

Bu proje derleme ve paket yükleme gerektirmez. Python 3 ile:

```bash
python3 -m http.server 5173
```

Sonra `http://localhost:5173` adresini açın. Testler için Node.js ile `npm test` çalıştırın.

## GitHub Pages yayını

1. Bu klasörün içeriğini bir GitHub deposunun köküne yükleyin.
2. Depoda **Settings → Pages → Build and deployment** bölümüne gidin.
3. **Deploy from a branch** seçin; `main` dalı ve `/(root)` klasörünü ayarlayın.
4. GitHub Pages tarafından verilen bağlantıyı açın.

Tüm dosya yolları göreli olduğundan proje deposunun `https://kullanici.github.io/depo/` adresinde çalışır. GitHub Pages yalnızca uygulama dosyalarını yayımlar. Web adresinde kayıtlar tarayıcının IndexedDB deposunda tutulur; cihazlar arasında otomatik eşitleme yoktur. Yerel dosya ile GitHub Pages adresinin kayıtları da ayrıdır. Tarayıcı verileri temizlenirse fişler silinir. **Hesap Planı → Yedek İndir** ile düzenli yedek alın; **Yedek Yükle** ile geri yükleyin.

## CSV biçimi

Başlıklar `Hesap Kodu,Hesap Adı,Taraf` olmalıdır. Hesap kodu benzersiz ve üç haneli; `Taraf` değeri `B` (borç) veya `A` (alacak) olmalıdır. Alıntı içindeki virgüller desteklenir. Yeni plan, eskisinin tamamının yerini alır. Fişlerin kullandığı bir kod eksikse değişiklik yapılmaz.

## Raporlama sınırları

- Gelir tablosu yalnızca hareket görmüş 6xx hesaplarını gösterir. Net satışlar, brüt satış, faaliyet, dönem ve dönem net kârı veya zararı ara toplamları hesapların net alacak eksi borç bakiyelerinden oluşur. 7xx ve 9xx hesapları otomatik aktarılmaz.
- Bilanço 1xx–2xx hesaplarını aktif, 3xx–5xx hesaplarını pasif olarak gösterir; 6xx dönem sonucu pasife eklenir. Aktif ve pasif eşit değilse uyarı çıkar.
- KDV satırları fiş girişindeki oran butonuyla isteğe bağlı eklenir; sürekli stok takibi ve dönem sonu aktarım fişleri otomatik oluşturulmaz. Satılan mal maliyeti fişi yalnızca ilgili şablon seçilince taslak olarak hazırlanır. Miktar alanı şimdilik bilgilendiricidir.
- **Kuruluş (102/500)** şablonu, 102 Bankalar hesabına borç ve 500 Sermaye hesabına alacak yazar. Fiş ve satır açıklamaları "Bankaya yatan para ile kuruluş" olur. Her seçimde 100.000–200.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Ticari Mal Alış Veresiye (153/320)** şablonu, 153 Ticari Mallar hesabına borç ve 320 Satıcılar hesabına alacak yazar. Fiş ve satır açıklamaları "Ticari Mal alışı veresiye" olur. Her seçimde 500.000–1.000.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Satış Veresiye (120/600)** şablonu, 120 Alıcılar hesabına borç ve 600 Yurt İçi Satışlar hesabına alacak yazar. Fiş ve satır açıklamaları "Satış Veresiye" olur. Tutar, kayıtlı fişlerden hesaplanan 153 Ticari Mallar hesabının borç bakiyesinin %70–%130 aralığında, 1.000'in katı seçilir. Bu aralıkta uygun tutar yoksa şablon uygulanmaz. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Satılan Mal Maliyeti (621/153)** şablonu, 621 Satılan Ticari Mallar Maliyeti hesabına borç ve 153 Ticari Mallar hesabına alacak yazar. Fiş ve satır açıklamaları "Satılan Mal Maliyeti" olur. Önce kayıtlı fişlerdeki 600 hesabının alacak bakiyesinin %60–%80 aralığından 1.000'in katı bir tutar seçilir. Seçilen tutar 153 hesabının borç bakiyesini aşarsa 153 bakiyesinin %60–%80 aralığından yeni bir tutar seçilir. Uygun tutar yoksa uyarı gösterilir. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Tahsilat Banka İle (102/120)** şablonu, 102 Bankalar hesabına borç ve 120 Alıcılar hesabına alacak yazar. Fiş ve satır açıklamaları "Müşteriden Tahsilat" olur. Tutar, kayıtlı fişlerdeki 120 hesabının net borç bakiyesinin %60–%90 aralığından 1.000'in katı seçilir. Uygun tutar yoksa uyarı gösterilir. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Ödeme Banka İle (320/102)** şablonu, 320 Satıcılar hesabına borç ve 102 Bankalar hesabına alacak yazar. Fiş ve satır açıklamaları "Satıcıya Ödeme" olur. Önce kayıtlı fişlerdeki 320 hesabının net alacak bakiyesinin %60–%90 aralığından 1.000'in katı bir tutar seçilir. Seçilen tutar 102 hesabının net borç bakiyesini aşarsa, 102 bakiyesinin %60–%90 aralığından yeniden tutar seçilir. Uygun tutar yoksa uyarı gösterilir. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Taşıt Alış Kredi (254/300)** şablonu, 254 Taşıtlar hesabına borç ve 300 Banka Kredileri hesabına alacak yazar. Fiş ve satır açıklamaları "Taşıt alış banka kredisi ile" olur. Her seçimde 1.000.000–2.000.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Kredi Kullanımı Kısa Vadeli (102/300)** şablonu, 102 Bankalar hesabına borç ve 300 Banka Kredileri hesabına alacak yazar. Fiş ve satır açıklamaları "Bankadan kısa vadeli kredi kullanımı" olur. Her seçimde 500.000–1.000.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Kredi Kullanımı Uzun Vadeli (102/400)** şablonu, 102 Bankalar hesabına borç ve 400 Banka Kredileri hesabına alacak yazar. Fiş ve satır açıklamaları "Bankadan uzun vadeli kredi kullanımı" olur. Her seçimde 500.000–1.000.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Genel Yönetim Gideri (632/329)** şablonu, 632 Genel Yönetim Giderleri hesabına borç ve 329 Diğer Ticari Borçlar hesabına alacak yazar. Fiş ve satır açıklamaları "Gider tahakkuku" olur. Her seçimde 50.000–100.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Personel Ücret Hakedişi - Yönetim (632/335)** şablonu, 632 Genel Yönetim Giderleri hesabına borç ve 335 Personele Borçlar hesabına alacak yazar. Fiş ve satır açıklamaları "Yönetime bağlı (idari) personel ücret hakedişi" olur. Her seçimde 50.000–100.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Personel Ücret Hakedişi - Pazarlama (631/335)** şablonu, 631 Pazarlama, Satış ve Dağıtım Giderleri hesabına borç ve 335 Personele Borçlar hesabına alacak yazar. Fiş ve satır açıklamaları "Pazarlamaya bağlı (idari) personel ücret hakedişi" olur. Her seçimde 50.000–100.000 arasında, 1.000'in katı yeni bir tutar hazırlanır; fiş kullanıcı Kaydet'e basınca saklanır.
- **Ücret Ödemesi (335/102)** şablonu, 335 Personele Borçlar hesabına borç ve 102 Bankalar hesabına alacak yazar. Fiş ve satır açıklamaları "Personel Ücretlerinin Ödenmesi" olur. Tutar, kayıtlı fişlerdeki 335 hesabının net alacak bakiyesinin %70–%90 aralığından 1.000'in katı seçilir. Uygun tutar yoksa uyarı gösterilir. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Faiz Ödemesi (660/102)** şablonu, 660 Kısa Vadeli Borçlanma Giderleri hesabına borç ve 102 Bankalar hesabına alacak yazar. Açıklama "Kredi Faizi Ödemesi" olur. Tutar, 300 ve 400 hesaplarının alacak bakiyeleri toplamının %1–%5'i arasından 1.000'in katı seçilir. Bu tutar 102 hesabının borç bakiyesini aşarsa, 102 bakiyesinin %20–%30'u arasından yeniden seçilir. Fiş kullanıcı Kaydet'e basınca saklanır.
- **Kurumlar Vergisi Ödenecek (691/360)** şablonu, 691 hesaba borç ve 360 hesaba alacak yazar. Açıklama "Dönem karı üzerinden kurumlar vergisi tahakkuku" olur. Gelir tablosundaki Dönem Kârı veya Zararı ara toplamı kâr ise %25'i, zarar ise mutlak değerinin %5'i hesaplanır ve en yakın 1.000 TL'ye yuvarlanır. Sonuç sıfırsa şablon uygulanmaz. Fiş kullanıcı Kaydet'e basınca saklanır.
- Uygulama eğitim içindir; resmî muhasebe kaydı veya mevzuata uygun beyanname oluşturmaz.
