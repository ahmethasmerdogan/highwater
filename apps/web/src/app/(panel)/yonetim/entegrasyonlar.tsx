"use client";

/**
 * Yönetim › Entegrasyonlar — Discord bildirim kanalları.
 *
 * Webhook adresleri veritabanında şifreli tutulur ve panelde **maskeli**
 * gösterilir. Maskeli değeri geri göndermek mevcut adresi korur; bu yüzden
 * bir alanı boş bırakmak "değiştirme" değil, "sil" anlamına gelir ve bu
 * ekranda açıkça yazılıdır.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DiscordConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import { GuideSection } from "@/shell/page";
import { Alert, Async, Button, InfoDot, Panel, Tag, TextInput, Toggle } from "@/design";

/** Kanalların ne taşıdığı — motorun yönlendirme tablosunun karşılığı. */
const CHANNEL_INFO: Record<string, { label: string; what: string }> = {
  islemler: {
    label: "İşlemler",
    what: "Pozisyon açılışı, kapanışı ve reddedilen emirler.",
  },
  havuz: {
    label: "Havuz",
    what: "Havuz güncellemeleri ve puan eşiği aşımları. Havuz yenilendiğinde 30 ayrı mesaj değil tek özet mesaj gider.",
  },
  alarm: {
    label: "Alarm",
    what: "Devre kesiciler, bayat veri ve borsa erişim engeli. Bu kanaldaki mesajlar herkese haber verir.",
  },
  sistem: {
    label: "Sistem",
    what: "Bot durum değişiklikleri ve genel işleyiş. Eşlenmemiş olaylar da buraya düşer.",
  },
};

function channelInfo(key: string) {
  return CHANNEL_INFO[key] ?? { label: key, what: "Bu kanalın açıklaması yazılmamış." };
}

export const ENTEGRASYONLAR = {
  summary: "Discord bildirim kanalları. Sistemin ürettiği olaylar buraya yönlendirilir.",
  guide: (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Sistem olayları Discord kanallarına gönderilebilir. Her olay türü belirli bir kanala
          yönlendirilir; kanal için webhook tanımlı değilse mesaj sistem kanalına düşer.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          Webhook adresleri veritabanında <strong>şifreli</strong> saklanır ve burada maskeli
          gösterilir. Maskeli değeri olduğu gibi bırakırsanız mevcut adres korunur.
        </p>
        <p>
          <strong>Bir alanı boşaltmak o kanalın webhook&apos;unu siler.</strong> Değiştirmek
          istemiyorsanız alana dokunmayın.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Kaydettikten sonra her kanalı “Test et” düğmesiyle deneyin. Test mesajı gitmiyorsa
          adres yanlış ya da Discord tarafında webhook silinmiş demektir.
        </p>
      </GuideSection>
    </>
  ),
};

export function EntegrasyonlarTab() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [webhooks, setWebhooks] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["discord"],
    queryFn: () => api.get<DiscordConfig>("/integrations/discord"),
  });

  /* Sunucudan gelen değerleri forma yükle — kullanıcı yazmaya başlamadıysa.
     Başladıysa yüklemek, yazılanı bir sonraki tazelemede silerdi. */
  useEffect(() => {
    if (query.data && !dirty) {
      setEnabled(query.data.enabled);
      setWebhooks(query.data.webhooks ?? {});
    }
  }, [query.data, dirty]);

  const save = useMutation({
    /* Uç `webhooks` bekler; `channels` göndermek hiçbir webhook'un
       kaydolmamasına yol açar. */
    mutationFn: () => api.put<DiscordConfig>("/integrations/discord", { enabled, webhooks }),
    onSuccess: () => {
      toast.success("Discord ayarları kaydedildi");
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["discord"] });
    },
    onError: (error: Error) => toast.error("Kaydedilemedi", error.message),
  });

  const test = useMutation({
    /* `channel` gövdede değil sorgu parametresinde bekleniyor. */
    mutationFn: (channel: string) =>
      api.post<{ sent: boolean; message: string }>(
        `/integrations/discord/test?channel=${encodeURIComponent(channel)}`,
      ),
    onSuccess: (result) => {
      if (result.sent) toast.success("Test mesajı gönderildi", result.message);
      else toast.warning("Test mesajı gitmedi", result.message);
    },
    onError: (error: Error) => toast.error("Test başarısız", error.message),
  });

  return (
    <Async query={query}>
      {(config) => (
        <>
          <Panel
            title="Discord"
            actions={
              <Button
                size="sm"
                variant="primary"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            }
          >
            <Toggle
              checked={enabled}
              onChange={(next) => {
                setEnabled(next);
                setDirty(true);
              }}
              label={
                <span className="flex items-center gap-1.5">
                  Discord bildirimleri açık
                  <InfoDot text="Kapalıyken hiçbir mesaj gönderilmez. Webhook adresleri silinmez, yalnızca gönderim durur." />
                </span>
              }
            />

            {!enabled && (
              <div className="mt-2">
                <Alert tone="warn">
                  Bildirimler kapalı. Devre kesici tetiklense bile Discord&apos;a mesaj gitmez.
                </Alert>
              </div>
            )}
          </Panel>

          <Panel
            title="Kanallar"
            description="Her kanal için Discord'dan aldığınız webhook adresini yapıştırın."
          >
            <div className="flex flex-col gap-3">
              {(config.channels ?? []).map((channel) => {
                const info = channelInfo(channel);
                const value = webhooks[channel] ?? "";
                const configured = Boolean(value);
                const masked = value.includes("•");

                return (
                  <div
                    key={channel}
                    className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
                    style={{ border: "1px solid var(--sn-border)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-medium"
                        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                      >
                        {info.label}
                      </span>
                      <span
                        className="sn-num"
                        style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                      >
                        #{channel}
                      </span>
                      <Tag tone={configured ? "up" : "neutral"}>
                        {configured ? "tanımlı" : "tanımsız"}
                      </Tag>
                      <Button
                        size="sm"
                        variant="quiet"
                        className="ml-auto"
                        disabled={!configured || test.isPending}
                        onClick={() => test.mutate(channel)}
                      >
                        Test et
                      </Button>
                    </div>

                    <p
                      className="mt-1"
                      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
                    >
                      {info.what}
                    </p>

                    <div className="mt-2">
                      <TextInput
                        value={value}
                        onChange={(event) => {
                          setWebhooks((current) => ({ ...current, [channel]: event.target.value }));
                          setDirty(true);
                        }}
                        placeholder="https://discord.com/api/webhooks/…"
                        className="sn-num"
                      />
                    </div>

                    {masked && (
                      <p
                        className="mt-1"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                      >
                        Adres maskeli gösteriliyor. Dokunmazsanız mevcut adres korunur;
                        değiştirmek için tamamını yeniden yapıştırın.
                      </p>
                    )}
                    {configured && !masked && (
                      <p
                        className="mt-1"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-warn)" }}
                      >
                        Yeni adres girildi. Kaydedene kadar geçerli olmaz.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Toplu gönderim nasıl çalışır">
            <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}>
              Aynı anda çok sayıda olay üretildiğinde her biri için ayrı mesaj gönderilmez.
              Örneğin havuz yenilendiğinde 30 coin değişse bile{" "}
              <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>tek bir özet mesaj</strong>{" "}
              gider. Bu, kanalı okunmaz hâle getiren bildirim yağmurunu engeller.
            </p>
            <p
              className="mt-2"
              style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}
            >
              Devre kesici gibi acil olaylar bu tamponlamaya girmez ve herkese haber verecek
              şekilde anında gönderilir.
            </p>
          </Panel>
        </>
      )}
    </Async>
  );
}
