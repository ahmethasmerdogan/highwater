/**
 * Terim sözlüğü — SARNIÇ'a özgü kavramların tek kaynağı.
 *
 * Hedef okur: **borsayı bilir, bu sistemi bilmez.** Bu yüzden "spread",
 * "ATR", "drawdown" gibi genel borsa terimleri kısa geçilir; havuz, puan
 * aileleri, huni, kalibrasyon, R, devre kesici gibi SARNIÇ kavramları
 * ayrıntılı anlatılır.
 *
 * Kullanım:
 *   <Term id="havuz" />            → altı noktalı terim, üstüne gelince balon
 *   <Explain id="havuz" />         → kart içinde açık paragraf
 *   term("havuz").short            → düz metin gerekiyorsa
 *
 * Kural: ekranda açıklanamayan sayı durmaz (DESIGN §1). Bir sayı ekleyip
 * buraya karşılığını yazmadıysan, iş yarım kalmıştır.
 */

export interface TermEntry {
  /** Kullanıcıya gösterilen ad. */
  label: string;
  /** Tek cümle — tooltip'te ve tablo başlığı altında görünür. */
  short: string;
  /** Bir-iki paragraf — açıklama kartlarında ve detay panellerinde. */
  long?: string;
  /** "Ne yapmalıyım" karşılığı; yalnızca eyleme dönük terimlerde. */
  action?: string;
  /** İlgili terimler — açıklama kartının altında bağlantı olarak çıkar. */
  see?: string[];
}

export const GLOSSARY: Record<string, TermEntry> = {
  /* ---------------------------------------------------------------- */
  /*  Havuz                                                            */
  /* ---------------------------------------------------------------- */
  havuz: {
    label: "Havuz",
    short:
      "Sistemin işlem yapmayı düşündüğü coinlerin listesi. Binance'teki her coin değil, likidite filtrelerinden geçenler.",
    long:
      "Binance spot piyasasında binlerce çift var; çoğu o kadar ince ki bir emir fiyatı kendi başına oynatır. Havuz, bu gürültüyü eleyip geriye ölçülebilir biçimde işlem görebilen coinleri bırakır. Sistem yalnızca havuzdaki coinleri puanlar ve yalnızca onlara pozisyon açar.\n\nHavuz sabit değil: belirli aralıklarla yeniden kurulur ve her kuruluşta veritabanına bir fotoğrafı yazılır. Bu fotoğraf olmadan geçmişe dönük dürüst bir test yapılamaz — bugünkü havuzla altı ay öncesini test etmek, o gün var olmayan bilgiyi kullanmak olurdu.",
    see: ["huni", "snapshot", "histerezis"],
  },
  huni: {
    label: "Filtre hunisi",
    short:
      "Havuz kurulurken adaylardan kaçının hangi filtrede elendiğini gösteren döküm.",
    long:
      "Havuz tek bir kuralla değil, arka arkaya çalışan bir filtre zinciriyle kurulur. Huni raporu bu zincirin her adımında kaç aday kaldığını ve kaçının elendiğini gösterir.\n\nBu rapor bir muhasebe kaydı değil, teşhis aracıdır: havuz beklenenden küçükse hangi filtrenin fazla agresif olduğu buradan görülür. Bir filtre tek başına adayların yarısından fazlasını eliyorsa, o filtre gerçekten tasarlandığı işi mi yapıyor yoksa veri eksikliğini mi eliyor — sorulması gereken soru budur.",
    see: ["havuz"],
  },
  snapshot: {
    label: "Havuz fotoğrafı",
    short:
      "Havuzun belirli bir andaki hâli; veritabanına yazılır ve bir daha değişmez.",
    long:
      "Havuz her yenilendiğinde o anki listesi, kuruluş gerekçesi ve ayar parmak izi ile birlikte kaydedilir. Geçmişe dönük bir test yapıldığında sistem bugünkü havuzu değil, o günün fotoğrafını kullanır.\n\nBu, sonuçları güzelleştirmemek için var: bugün bildiğimiz kazanan coinlerle geçmişi test etmek, cevabı bilerek sınava girmektir.",
    see: ["havuz", "yaklasik_evren", "config_hash"],
  },
  histerezis: {
    label: "Histerezis",
    short:
      "Bir coinin havuza girip çıkma eşiğinin farklı olması — sınırda gidip gelmeyi önler.",
    long:
      "Giriş eşiği ile çıkış eşiği aynı olsaydı, tam sınırda duran bir coin her yenilemede girip çıkardı. Her giriş-çıkış işlem maliyeti demek. Histerezis, çıkış eşiğini giriş eşiğinden biraz gevşek tutarak bu salınımı keser: içeri girmek için daha iyi olmak gerekir, ama içeride kalmak için biraz daha toleranslıdır.",
    see: ["havuz"],
  },
  config_hash: {
    label: "Ayar parmak izi",
    short:
      "Bir puanlamayı veya havuzu üreten ayarların özeti. Aynı parmak izi = aynı kurallar.",
    long:
      "Aynı anda birden fazla bot farklı ağırlıklarla puanlama yapabilir. Aynı coin iki farklı botta iki farklı puan alır ve bunları tek listede karıştırmak sıralamayı anlamsız kılar.\n\nParmak izi bu ayrımı taşır: panel her seferinde tek bir ayar kümesinin sonuçlarını gösterir. Ayarların herhangi biri değişirse parmak izi de değişir, yani eski sonuçlarla yenisi kazara karıştırılamaz.",
    see: ["puan"],
  },
  kara_liste: {
    label: "Kara liste",
    short: "Elle engellenmiş coinler — filtrelerden geçse bile havuza alınmaz.",
    action:
      "Bir coini işlem dışı bırakmak istiyorsanız buraya ekleyin; bir sonraki havuz yenilemesinde çıkar.",
    see: ["havuz"],
  },
  referans_sembol: {
    label: "Referans sembol",
    short:
      "Piyasanın genel yönünü ölçmek için izlenen coin (varsayılan BTC). İşlem adayı değildir.",
    long:
      "BTC bir alım adayı değil, bir ölçü aletidir: genel piyasa rejiminin yukarı mı aşağı mı olduğunu söyler ve bu, pozisyon boyutlarını etkiler.\n\nBu yüzden BTC havuzun filtrelerinden geçip geçmediğine bakılmaksızın ayrıca izlenir. Bir dönem yalnızca havuzdaki coinler izleniyordu; BTC volatilite filtresine takılıp havuzdan düşünce rejim hesabı üç gün eski veriyle yapılır olmuştu ve bunu kimse görmüyordu.",
    see: ["rejim"],
  },

  /* ---------------------------------------------------------------- */
  /*  Puanlama                                                         */
  /* ---------------------------------------------------------------- */
  puan: {
    label: "Puan",
    short:
      "Bir coinin 0–100 arası çekicilik notu. Fiyat tahmini değil, aynı andaki diğer coinlere göre sıralama.",
    long:
      "Puan mutlak bir yargı değildir: \"bu coin yükselecek\" demez. Havuzdaki coinleri aynı anda, aynı ölçütlerle karşılaştırıp sıralar. 80 puan, \"şu an havuzdaki çoğu coinden daha uygun görünüyor\" demektir.\n\nPuan beş aileden gelen katkıların toplamıdır; üstüne formasyon ve mum sinyalleri küçük bir düzeltme ekler. Her puanın gerekçesi saklanır — hangi ailenin ne kadar katkı verdiği ve ilk üç sebep her zaman görülebilir.\n\nSistemin cevaplaması gereken asıl soru şu: bu puan gerçekten ileri getiriyi öngörüyor mu? Cevabı Kalibrasyon sayfası verir ve cevap \"hayır\" olabilir.",
    see: ["aile_trend", "aile_momentum", "aile_flow", "aile_vol", "aile_sr", "kalibrasyon", "gerekce"],
  },
  aile_trend: {
    label: "Trend ailesi",
    short: "Fiyatın yönü ve bu yönün zaman dilimleri arasında uyumlu olup olmadığı.",
    long:
      "Farklı zaman dilimlerindeki (1 saat, 4 saat, 1 gün) yön okumalarını birleştirir. Üç dilim de aynı yönü gösteriyorsa katkı yüksek olur; birbiriyle çelişiyorsa düşer.\n\nBu ailenin girdisi günlük ve 4 saatlik veriye dayanır — o veri bayatsa aile sessizce yanlış besleniyor demektir.",
    see: ["puan"],
  },
  aile_momentum: {
    label: "Momentum ailesi",
    short: "Hareketin hızı ve gücü — aşırı alım/satım bölgelerine ne kadar yaklaşıldığı.",
    see: ["puan"],
  },
  aile_flow: {
    label: "Akış ailesi",
    short:
      "Emirlerin hangi taraftan geldiği: alıcılar mı piyasa emriyle giriyor, satıcılar mı.",
    long:
      "Hacmin tek başına yönü yoktur; 100 birimlik işlem hem alım hem satım olabilir. Akış ailesi, işlemin agresif tarafını ayırır: piyasa emriyle alan mı çok, satan mı. Alıcı baskısının sürekli yüksek olması, fiyat henüz hareket etmemişken bile bir işarettir.",
    see: ["puan"],
  },
  aile_vol: {
    label: "Volatilite ailesi",
    short: "Oynaklığın seviyesi ve sıkışma/genişleme durumu.",
    long:
      "Yüksek oynaklık kendi başına iyi ya da kötü değildir; risk hesabına girer. Bu aile ayrıca sıkışmayı arar — uzun süre dar bantta gezen fiyat, genişlediğinde daha büyük hareket üretme eğilimindedir.",
    see: ["puan", "atr"],
  },
  aile_sr: {
    label: "Destek/direnç ailesi",
    short:
      "Fiyatın destek ve dirence göre konumu; yukarı alanın aşağı riske oranı.",
    long:
      "Fiyat direncin hemen altındaysa yukarı alan dardır, desteğin hemen üstündeyse aşağı risk sınırlıdır. Bu aile o geometriyi ölçer ve puanın en somut parçasıdır: seviyeler grafikte gösterilebilir.",
    see: ["puan", "rr", "poc"],
  },
  formasyon: {
    label: "Formasyon değiştiricisi",
    short:
      "Tespit edilen grafik formasyonlarının puana eklediği ya da çıkardığı küçük düzeltme.",
    long:
      "Formasyon motoru puanın gövdesi değil, kenar süsüdür — bilinçli olarak küçük tutulmuştur. Formasyon tespiti öznelliğe en açık parçadır; ağırlığı büyük olsaydı ölçümü bulandırırdı.\n\nHacimle doğrulanmış bir formasyon, doğrulanmamış olandan daha fazla katkı verir.",
    see: ["puan"],
  },
  gerekce: {
    label: "Gerekçe",
    short: "Bir puanın neyden oluştuğu: aile katkıları, ilk sebepler ve yüzdelikler.",
    long:
      "Sistemin ilkesi şudur: açıklanamayan hiçbir sayı ekranda durmaz. Her puan hesaplandığı anda gerekçesi de saklanır — hangi aile kaç puan verdi, ilk üç sebep neydi, coin her ölçütte havuzun neresinde duruyor.\n\nBir pozisyon açıldığında o anki gerekçe pozisyona bağlanır; aylar sonra \"bu neden alınmış\" sorusunun cevabı durur.",
    see: ["puan", "yuzdelik"],
  },
  yuzdelik: {
    label: "Yüzdelik",
    short:
      "Coinin bir ölçütte havuzun neresinde durduğu. 90 = havuzun %90'ından daha yüksek.",
    long:
      "Ham değerler coinler arasında karşılaştırılamaz: birinin %3 günlük oynaklığı normal, diğerininki uç olabilir. Yüzdelik bu farkı ortadan kaldırır ve her ölçütü aynı ölçeğe getirir. Puanlamanın \"kesitsel\" olması bu demek — coin kendi geçmişiyle değil, aynı andaki diğer coinlerle karşılaştırılır.",
    see: ["puan"],
  },

  /* ---------------------------------------------------------------- */
  /*  Kalibrasyon                                                      */
  /* ---------------------------------------------------------------- */
  kalibrasyon: {
    label: "Kalibrasyon",
    short:
      "Puanlamanın işe yarayıp yaramadığının ölçümü. Sistemin dürüstlük organı.",
    long:
      "Bu sayfa sistemin kendi kendini sınadığı yerdir ve cevabı \"hayır\" olabilir. Soru şu: yüksek puan alan coinler gerçekten daha iyi getiri sağladı mı?\n\nÖlçüm üç şekilde yapılır: puan dilimlerine göre ortalama getiri (artan olmalı), puan ile getiri arasındaki sıra ilişkisi (pozitif olmalı), ve aile bazında öngörü gücü.\n\nİlişki düz çıkarsa puanlama değer katmıyor demektir. Sayfa bunu büyük puntoyla yazar; süslemez.",
    see: ["desil", "ic", "spearman", "monotonluk", "puan"],
  },
  desil: {
    label: "Desil",
    short:
      "Puanlar en düşükten en yükseğe onluk dilimlere bölünür. 10. desil = en yüksek puanlılar.",
    long:
      "Her dilimin ortalama ileri getirisi hesaplanır. Puanlama çalışıyorsa bu ortalamalar dilim numarası büyüdükçe artmalıdır.\n\nYanlarındaki güven aralığı önemlidir: aralıklar birbirini bolca kesiyorsa fark gürültü olabilir, gerçek bir sinyal değil.",
    see: ["kalibrasyon", "monotonluk", "guven_araligi"],
  },
  monotonluk: {
    label: "Monotonluk",
    short:
      "Desil ortalamalarının sürekli artıp artmadığı. Artıyorsa puan sıralaması anlamlı.",
    see: ["desil", "kalibrasyon"],
  },
  ic: {
    label: "Bilgi katsayısı (IC)",
    short:
      "Bir özellik ailesinin ileri getiriyle ne kadar ilişkili olduğu. 0 = hiç bilgi yok.",
    long:
      "Aile bazında hesaplanır ve zaman içinde izlenir. Bir ailenin katsayısı uzun süre sıfır civarında geziyorsa, o aileye verilen ağırlık sorgulanmalıdır — puana katkı veriyor ama öngörü katmıyor demektir.\n\nDeğerler küçüktür: finansal veride 0,03–0,05 bandı bile anlamlı sayılır. Büyük değerler genellikle bir hata işaretidir.",
    see: ["kalibrasyon", "puan"],
  },
  spearman: {
    label: "Sıra korelasyonu",
    short:
      "Puan sıralaması ile getiri sıralamasının uyumu. +1 tam uyum, 0 ilişki yok, −1 ters.",
    long:
      "Mutlak değerlerle değil sıralarla çalışır; bu yüzden birkaç uç getirinin sonucu tek başına sürüklemesine izin vermez. Yanındaki olasılık değeri, bu ilişkinin şansa bağlı olma ihtimalini söyler.",
    see: ["kalibrasyon"],
  },
  guven_araligi: {
    label: "Güven aralığı",
    short:
      "Ölçülen ortalamanın gerçekte hangi bandın içinde olabileceği. Bant sıfırı içeriyorsa fark belirsizdir.",
    see: ["desil"],
  },

  /* ---------------------------------------------------------------- */
  /*  Pozisyon, risk, boyutlandırma                                    */
  /* ---------------------------------------------------------------- */
  r_katsayisi: {
    label: "R (risk birimi)",
    short:
      "Bir işlemin sonucu, o işlemde göze alınan riske bölünür. +2R = riskin iki katı kazanç.",
    long:
      "İki işlemin kârını doğrudan karşılaştırmak yanıltıcıdır: biri büyük pozisyonla küçük hareket, diğeri küçük pozisyonla büyük hareket yakalamış olabilir. R bunu eşitler.\n\n1R, girişten stop seviyesine olan mesafedir — yani pozisyon açılırken kaybetmeyi göze alınan tutar. İşlem +2R kapandıysa, göze alınan riskin iki katı kazanılmıştır. Sistemin uzun vadeli başarısı R cinsinden beklentiyle ölçülür, TL cinsinden kârla değil.",
    see: ["stop", "beklenti"],
  },
  stop: {
    label: "Stop",
    short: "Pozisyonun zararla kapatılacağı fiyat. Her zaman girişin altındadır.",
    long:
      "Stop pozisyon açılırken belirlenir ve risk hesabının temelidir: pozisyon büyüklüğü, stop'a kadarki mesafe sermayenin belirlenen yüzdesini aşmayacak şekilde seçilir.\n\nStop zamanla yukarı taşınabilir (başabaşa çekme, iz süren stop) ama asla aşağı indirilmez. Aşağı indirmek, alınan riski sonradan büyütmektir.",
    see: ["r_katsayisi", "basabas", "iz_suren"],
  },
  basabas: {
    label: "Başabaş kilidi",
    short:
      "Fiyat yeterince lehe hareket edince stop giriş seviyesine çekilir; artık zarar edemez.",
    see: ["stop"],
  },
  iz_suren: {
    label: "İz süren stop",
    short: "Fiyat yükseldikçe stop da yükselir, kârın bir kısmını kilitler.",
    see: ["stop"],
  },
  mfe_mae: {
    label: "MFE / MAE",
    short:
      "Pozisyon açıkken görülen en iyi (MFE) ve en kötü (MAE) noktalar.",
    long:
      "Çıkış kurallarının kalitesini ölçer. MFE sürekli yüksek ama kapanış kârı düşükse, kâr alma çok geç oluyor demektir. MAE sürekli stop'a çok yakınsa, stop'lar gereğinden dar konuyor demektir.",
    see: ["stop"],
  },
  beklenti: {
    label: "Beklenti",
    short: "İşlem başına ortalama sonuç, R cinsinden. Pozitif olması gerekir.",
    see: ["r_katsayisi"],
  },
  kar_faktoru: {
    label: "Kâr faktörü",
    short:
      "Toplam kazancın toplam kayba oranı. 1'in altı zarar, 1,5 üstü iyi kabul edilir.",
  },
  drawdown: {
    label: "Düşüş (drawdown)",
    short: "Zirveden en dip noktaya kadar olan kayıp yüzdesi.",
    long:
      "Sistemin en dürüst tek sayısıdır: kazanç oranı gerçek parayla yaşanan acıyı anlatmaz, düşüş anlatır. Canlıya geçiş kapısı bu değerin %15'in altında kalmasını şart koşar.",
  },
  maruziyet: {
    label: "Maruziyet",
    short: "Sermayenin ne kadarının şu an açık pozisyonlarda olduğu.",
    see: ["kume"],
  },
  kume: {
    label: "Korelasyon kümesi",
    short:
      "Birlikte hareket etme eğilimindeki coinler. Aynı kümeye toplam bir üst sınır konur.",
    long:
      "Beş farklı coine ayrı ayrı pozisyon açmak, hepsi aynı anda aynı yöne hareket ediyorsa beş ayrı risk değil tek büyük risktir. Sistem coinleri hareket benzerliğine göre gruplar ve bir grubun toplam payına sınır koyar.\n\nBu sınır olmadan \"çeşitlendirme\" bir yanılsamadır.",
    see: ["maruziyet"],
  },
  risk_pct: {
    label: "İşlem başına risk",
    short:
      "Tek bir işlemde göze alınan sermaye yüzdesi. Pozisyon boyutu buradan hesaplanır.",
    action:
      "Yükseltmek kazancı da kaybı da büyütür. Canlıya geçişte bu değerin yarıya indirilmesi şarttır.",
    see: ["stop", "r_katsayisi"],
  },

  /* ---------------------------------------------------------------- */
  /*  Devre kesiciler                                                  */
  /* ---------------------------------------------------------------- */
  devre_kesici: {
    label: "Devre kesici",
    short:
      "Belirli bir sınır aşılınca sistemi otomatik frenleyen kural. İnsan müdahalesi beklemez.",
    long:
      "Kötü giden bir günün daha kötü gitmesini engellemek için vardır. Bir kesici tetiklendiğinde sistem ya yeni giriş yapmayı durdurur, ya botu bekletir, ya da her şeyi kapatır.\n\nKesiciler kâr etmek için değil, hayatta kalmak için vardır. Bir kesicinin hiç tetiklenmemiş olması iyi haber değildir — test edilmemiş demektir.",
    see: ["kill_switch", "ck_daily_loss", "ck_stale_data"],
  },
  ck_daily_loss: {
    label: "Günlük zarar sınırı",
    short: "Gün içi zarar eşiği aşılınca yeni pozisyon açılmaz. Açıklar korunur.",
    see: ["devre_kesici"],
  },
  ck_weekly_loss: {
    label: "Haftalık zarar sınırı",
    short: "Hafta içi birikmiş zarar eşiği aşılınca yeni giriş durur.",
    see: ["devre_kesici"],
  },
  ck_max_drawdown: {
    label: "Azami düşüş sınırı",
    short:
      "Zirveden düşüş eşiği aşılınca bot durur ve elle yeniden başlatılmayı bekler.",
    see: ["devre_kesici", "drawdown"],
  },
  ck_consecutive_losses: {
    label: "Üst üste zarar",
    short:
      "Arka arkaya belirli sayıda zararlı işlem olunca bot bekletilir — koşullar değişmiş olabilir.",
    see: ["devre_kesici"],
  },
  ck_stale_data: {
    label: "Bayat veri",
    short:
      "Piyasa verisi belirli süre yenilenmezse karar alınmaz. Eski fiyatla işlem yapmak kör işlemdir.",
    long:
      "En sık tetiklenen kesicidir ve genellikle veri servisinin yeniden başlamasıyla ilgilidir. Kısa süreli tetiklenmesi normaldir; sürekli tetikleniyorsa veri akışında gerçek bir sorun vardır.",
    see: ["devre_kesici", "veri_tazeligi"],
  },
  ck_api_error_rate: {
    label: "API hata oranı",
    short: "Borsaya giden isteklerin hata oranı yükselirse sistem geri çekilir.",
    see: ["devre_kesici"],
  },
  ck_ip_ban: {
    label: "IP engeli",
    short:
      "Borsa hız sınırı aşıldığı için erişimi engellediğinde tüm istekler durur.",
    see: ["devre_kesici", "agirlik"],
  },
  kill_switch: {
    label: "Acil durdurma",
    short: "Tüm botları durdurur, açık emirleri iptal eder. Geri alınamaz.",
    action:
      "Yalnızca gerçekten her şeyin durması gerektiğinde kullanın. Açık pozisyonlar piyasa fiyatından kapatılır.",
    see: ["devre_kesici"],
  },

  /* ---------------------------------------------------------------- */
  /*  Bot ve yürütme                                                   */
  /* ---------------------------------------------------------------- */
  bot: {
    label: "Bot",
    short:
      "Bir strateji sürümünü belirli sermaye ve zaman dilimiyle çalıştıran bağımsız süreç.",
    long:
      "Her bot kendi sermayesini, pozisyonlarını ve risk sayaçlarını taşır. Birden fazla bot aynı anda farklı ayarlarla çalışabilir; bu, ayarları karşılaştırmanın en dürüst yoludur.\n\nBot arayüzden bağımsız bir servistir. Paneli veya terminali kapatmak botu durdurmaz.",
    see: ["strateji", "kagit_uzeri"],
  },
  kagit_uzeri: {
    label: "Kağıt üstü (paper)",
    short:
      "Gerçek veriyle, sahte parayla çalışma. Emirler borsaya gitmez, dahili motorda simüle edilir.",
    long:
      "Fiyatlar, hacimler, emir defteri — hepsi gerçek. Yalnızca emir borsaya gitmez; sistem kendi içinde \"bu emir şu fiyattan şu kadar dolardı\" hesabı yapar ve komisyon, kayma, gecikmeyi de modele katar.\n\nŞu an canlı para yoktur ve canlıya geçiş, sıralanmış bir dizi şart sağlanmadan açılmaz.",
    see: ["kayma", "bot"],
  },
  heartbeat: {
    label: "Yaşam sinyali",
    short:
      "Botun \"çalışıyorum\" diye attığı düzenli sinyal. Kesilirse bot takılmış demektir.",
    see: ["bot"],
  },
  bot_durum: {
    label: "Bot durumu",
    short:
      "Taslak · Çalışıyor · Duraklatıldı · Durduruldu · Hata · Kısıtlı — botun yaşam döngüsündeki yeri.",
    long:
      "**Taslak**: kurulmuş ama hiç başlatılmamış.\n**Çalışıyor**: kararları alıyor ve işlem açabilir.\n**Duraklatıldı**: açık pozisyonlar yönetiliyor ama yeni giriş yok.\n**Durduruldu**: elle veya bir kesici tarafından durdurulmuş.\n**Hata**: beklenmeyen bir sorunla karşılaştı, müdahale gerekir.\n**Kısıtlı**: çalışıyor ama bir devre kesici nedeniyle yeni giriş yapmıyor.",
    see: ["bot", "devre_kesici"],
  },
  cikis_sebebi: {
    label: "Çıkış sebebi",
    short: "Pozisyonun neden kapandığı — kural mı, risk mi, elle mi.",
    long:
      "**Stop**: zarar durdurma seviyesine değdi.\n**Başabaş**: korumaya çekilmiş stop tetiklendi.\n**İz süren**: yükselen stop tetiklendi, kârın bir kısmı kilitlendi.\n**Puan**: coinin puanı elde tutma eşiğinin altına düştü.\n**Süre**: azami tutma süresi doldu.\n**Rotasyon**: daha yüksek puanlı bir aday için yer açıldı.\n**Acil durdurma**: kill switch.\n**Listeden çıkma**: coin borsadan kalktı.\n**Elle**: kullanıcı kapattı.",
    see: ["stop", "puan"],
  },
  rotasyon: {
    label: "Rotasyon",
    short:
      "Daha yüksek puanlı bir aday için mevcut pozisyonun kapatılması. Her rotasyon maliyet üretir.",
    see: ["cikis_sebebi", "maliyet_payi"],
  },

  /* ---------------------------------------------------------------- */
  /*  Maliyet ve yürütme kalitesi                                      */
  /* ---------------------------------------------------------------- */
  kayma: {
    label: "Kayma (slippage)",
    short:
      "Beklenen fiyat ile gerçekleşen fiyat arasındaki fark. Emir defteri derinliğinden doğar.",
    long:
      "Bir alım emri en iyi satış fiyatından başlar ve emir büyüdükçe defterde yukarı tırmanır. Kağıt motoru bu tırmanışı gerçek emir defteri anlık görüntüsüyle modeller — sabit bir varsayım kullanmaz.\n\nKayma bir varsayım içerir; ölçülen spread ise gerçek veridir. İkisi Maliyet bölümünde ayrı gösterilir çünkü güvenilirlikleri farklıdır.",
    see: ["spread", "bps", "maliyet_payi"],
  },
  spread: {
    label: "Spread",
    short: "En iyi alış ile en iyi satış arasındaki fark. Her gidiş-dönüşün gizli maliyeti.",
    see: ["kayma", "bps"],
  },
  bps: {
    label: "Baz puan (bps)",
    short: "Yüzde birin yüzde biri. 100 bps = %1. Küçük maliyetleri yazmanın kısa yolu.",
  },
  maliyet_payi: {
    label: "Maliyet payı",
    short:
      "Brüt kârın ne kadarının komisyon ve kaymaya gittiği. Yüksekse strateji fazla işlem yapıyor.",
    long:
      "Bir strateji kağıt üzerinde kârlı görünüp maliyetten sonra zarara dönebilir. Bu oran, kârın gerçekten sizde kalan kısmını gösterir.\n\nOran %30'u geçiyorsa, işlem sıklığı stratejinin kendi kenarını yiyor demektir.",
    see: ["kayma", "rotasyon"],
  },
  agirlik: {
    label: "Ağırlık kullanımı",
    short:
      "Binance'in dakikalık istek bütçesinin ne kadarının kullanıldığı. Aşılırsa erişim kesilir.",
    long:
      "Binance her isteğe bir ağırlık atar ve dakika başına toplam bir bütçe verir. Bütçe IP başınadır — bu yüzden tüm piyasa verisi tek bir servisten çekilir ve hiçbir bot doğrudan borsaya istek atmaz.\n\nKullanım %70'i sürekli aşıyorsa bir sorun vardır.",
    see: ["ck_ip_ban"],
  },

  /* ---------------------------------------------------------------- */
  /*  Backtest                                                         */
  /* ---------------------------------------------------------------- */
  backtest: {
    label: "Geçmişe dönük test",
    short:
      "Stratejinin geçmiş veri üzerinde çalıştırılması. Sonuçlar gerçek değil, tahmindir.",
    long:
      "Aynı puanlama ve boyutlandırma kodu, geçmiş barlar üzerinde bar bar yürütülür. Sistemde \"backtest sürümü\" diye ayrı bir kod yoktur — değişen tek şey emirlerin nereye gittiğidir.\n\nBir backtest sonucu bir vaat değildir. Geçmişte iyi çalışmış olmak gelecekte çalışacağını göstermez ve iyi görünen sonuçların çoğu, farkında olmadan yapılmış arama sonucudur.",
    see: ["kiyas", "rastgele_portfoy", "out_of_sample", "yaklasik_evren"],
  },
  kiyas: {
    label: "Kıyas ölçütü",
    short:
      "Sonucun karşılaştırıldığı alternatif. Bir getiri, alternatifi olmadan hiçbir şey ifade etmez.",
    long:
      "%20 kazanç, aynı dönemde her şeyi eşit alıp tutmak %25 getirdiyse kötü bir sonuçtur. Sistem her raporda üç kıyas gösterir: havuzun eşit ağırlıklı sepeti, BTC'yi al-tut, ve devir hızı eşleştirilmiş rastgele portföy.",
    see: ["rastgele_portfoy", "backtest"],
  },
  rastgele_portfoy: {
    label: "Rastgele portföy",
    short:
      "Aynı sıklıkta ama rastgele seçilen coinlerle kurulan portföy. En sert sınav budur.",
    long:
      "Puanlamayı geçemediği tek kıyas budur ve en önemlisidir. Rastgele seçim aynı getiriyi üretiyorsa, kazancın kaynağı sıralama değil, sadece sık işlem yapmanın ve yeniden dengelemenin mekanik etkisidir.\n\nBaşka bir deyişle: sistemin var olma gerekçesi bu testte belli olur.",
    see: ["kiyas", "backtest"],
  },
  out_of_sample: {
    label: "Kilitli dönem",
    short:
      "Ayar denemelerine kapalı tutulan veri aralığı. Yalnızca son doğrulama için açılır.",
    long:
      "Aynı veri üzerinde ayarlarla defalarca oynanırsa, sonunda o veriye uyan bir kombinasyon mutlaka bulunur — ve bu bir keşif değil, ezberdir. Kilitli dönem bu ezberi yakalamak için ayrılır.\n\nHer denemenin deftere yazılması bu yüzden şart: kaç kez denendiği bilinmeden sonucun anlamı ölçülemez.",
    see: ["backtest"],
  },
  yaklasik_evren: {
    label: "Yaklaşık evren",
    short:
      "Havuz fotoğrafı bulunmayan dönemler için havuzun tahmin edilmesi. Sonuç iyimser sapabilir.",
    long:
      "Fotoğrafı olmayan bir dönem test edildiğinde sistem havuzu yeniden kurmak zorunda kalır ve bunu bugünkü bilgiyle yapma riski taşır. Bu durumda rapor açıkça damgalanır — sessizce geçilmez.",
    see: ["havuz", "snapshot", "backtest"],
  },
  kirmizi_bayrak: {
    label: "Kırmızı bayrak",
    short:
      "Sonuç fazla iyi göründüğünde basılan uyarı. Genellikle hata işaretidir, başarı değil.",
    long:
      "Çok yüksek risk-ayarlı getiri, çok az işlem, sıfıra yakın düşüş — bunlar iyi haber gibi görünür ama pratikte neredeyse her zaman bir modelleme hatasını gösterir: maliyetin unutulması, geleceğe bakan bir veri, ya da fazla küçük örneklem.",
    see: ["backtest"],
  },

  /* ---------------------------------------------------------------- */
  /*  Veri                                                             */
  /* ---------------------------------------------------------------- */
  veri_tazeligi: {
    label: "Veri tazeliği",
    short: "Her zaman dilimindeki en yeni mumun yaşı. Eskiyorsa kararlar bayat veriyle alınır.",
    long:
      "Bir zaman dilimi tamamen durduğunda mumlar arasında boşluk oluşmaz — seri sadece kısa kalır. Bu yüzden yalnızca \"aradaki boşluklara\" bakan bir denetim donmayı göremez; son mumun bugüne uzaklığına da bakmak gerekir.",
    see: ["bosluk", "ck_stale_data"],
  },
  bosluk: {
    label: "Veri boşluğu",
    short: "Olması gereken ama gelmemiş mumlar. Otomatik olarak yeniden çekilir.",
    see: ["veri_tazeligi"],
  },
  aykiri_deger: {
    label: "Aykırı değer",
    short:
      "Alışılmadık büyüklükte fiyat hareketi. Çoğu zaman veri hatası değil, gerçek piyasa hareketidir.",
    see: ["bosluk"],
  },
  karar_bari: {
    label: "Karar barı",
    short:
      "Kararların alındığı mum. Bir mum kapanmadan o mumun verisi karara giremez.",
    long:
      "Sistem yüksek frekanslı değildir; karar birimi mum kapanışıdır. Kapanmamış bir mumun verisini kullanmak, gelecekten bilgi sızdırmaktır ve bu yasaktır — her yeni gösterge için bunu sınayan ayrı bir test yazılır.",
    see: ["backtest"],
  },

  /* ---------------------------------------------------------------- */
  /*  Teknik ölçütler (kısa geçilir — okur bunları biliyor)             */
  /* ---------------------------------------------------------------- */
  atr: {
    label: "ATR",
    short: "Ortalama gerçek aralık — oynaklığın fiyat cinsinden ölçüsü. Stop mesafesinde kullanılır.",
  },
  poc: {
    label: "POC",
    short: "En çok hacmin geçtiği fiyat seviyesi. Fiyatın çekildiği bölge.",
  },
  rr: {
    label: "Ödül/risk",
    short: "Dirence olan mesafenin desteğe olan mesafeye oranı. 2,0 = yukarı alan iki kat.",
    see: ["aile_sr"],
  },
  rejim: {
    label: "Piyasa rejimi",
    short:
      "Genel piyasanın yönü. Referans sembolün uzun vadeli ortalamasına göre belirlenir ve pozisyon boyutlarını ölçekler.",
    see: ["referans_sembol"],
  },

  /* ---------------------------------------------------------------- */
  /*  Strateji                                                         */
  /* ---------------------------------------------------------------- */
  strateji: {
    label: "Strateji",
    short: "Puan ağırlıkları, eşikler ve çıkış kurallarından oluşan kural kümesi.",
    see: ["strateji_surum", "bot"],
  },
  strateji_surum: {
    label: "Strateji sürümü",
    short:
      "Stratejinin belirli bir hâli. Her değişiklik yeni sürüm doğurur; eskisi silinmez.",
    long:
      "Bir bot her zaman belirli bir sürümü çalıştırır. Ayarları değiştirmek çalışan botun davranışını sessizce değiştirmez — yeni bir sürüm doğar ve bot ona geçirilmelidir.\n\nDondurulmuş sürüm bir daha değiştirilemez; geçmişe dönük testlerin dayanağı budur.",
    see: ["strateji"],
  },

  /* ---------------------------------------------------------------- */
  /*  Yönetim                                                          */
  /* ---------------------------------------------------------------- */
  denetim_kaydi: {
    label: "Denetim kaydı",
    short: "Kim, ne zaman, hangi yönetimsel işlemi, hangi IP'den yaptı.",
  },
  rol: {
    label: "Yetki",
    short:
      "Yönetici her şeyi yapar · İşlemci bot ve strateji yönetir · İzleyici yalnızca görür.",
  },
};

/** Sözlükten kayıt getirir. Bulunamazsa `undefined` — çağıran karar verir. */
export function term(id: string): TermEntry | undefined {
  return GLOSSARY[id];
}

/** Tooltip metni; terim yoksa boş dize döner ki balon hiç açılmasın. */
export function termShort(id: string): string {
  return GLOSSARY[id]?.short ?? "";
}

/** Terimin gösterilecek adı; sözlükte yoksa id'nin kendisi. */
export function termLabel(id: string): string {
  return GLOSSARY[id]?.label ?? id;
}
