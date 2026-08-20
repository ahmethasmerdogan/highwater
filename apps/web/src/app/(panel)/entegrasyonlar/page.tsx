"use client";

/**
 * Entegrasyonlar — Discord bildirim kanalları.
 *
 * Webhook adresleri veritabanında şifreli tutulur ve panelde **maskeli**
 * gösterilir. Maskeli değeri geri göndermek mevcut adresi korur; bu yüzden
 * bir alanı boş bırakmak "değiştirme" değil, "sil" anlamına gelir ve bu
 * ekranda açıkça yazılıdır.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, StatusPill } from "@/ui";
import { api, type DiscordConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Page, Section, Async } from "@/components/common/page";
import { InfoDot } from "@/components/common/explain";

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

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [webhooks, setWebhooks] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["discord"],
    queryFn: () => api.get<DiscordConfig>("/integrations/discord"),
  });

  /* Sunucudan gelen değerleri forma yükle — kullanıcı yazmaya başlamadıysa. */
  useEffect(() => {
    if (query.data && !dirty) {
      setEnabled(query.data.enabled);
      setWebhooks(query.data.webhooks ?? {});
    }
  }, [query.data, dirty]);

  const save = useMutation({
    mutationFn: () =>
      // Uç `webhooks` bekler; `channels` göndermek hiçbir webhook'un
      // kaydolmamasına yol açar.
      api.put<DiscordConfig>("/integrations/discord", { enabled, webhooks }),
    onSuccess: () => {
      toast.success("Discord ayarları kaydedildi");
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["discord"] });
    },
    onError: (e: Error) => toast.error("Kaydedilemedi", e.message),
  });

  const test = useMutation({
    // `channel` gövdede değil sorgu parametresinde bekleniyor.
    mutationFn: (channel: string) =>
      api.post<{ sent: boolean; message: string }>(
        `/integrations/discord/test?channel=${encodeURIComponent(channel)}`,
      ),
    onSuccess: (r) => {
      if (r.sent) toast.success("Test mesajı gönderildi", r.message);
      else toast.warning("Test mesajı gitmedi", r.message);
    },
    onError: (e: Error) => toast.error("Test başarısız", e.message),
  });

  return (
    <Page
      title="Entegrasyonlar"
      description="Discord bildirim kanalları. Sistemin ürettiği olaylar buraya yönlendirilir."
      intro={{
        storageKey: "entegrasyonlar",
        what: "Sistem olayları Discord kanallarına gönderilebilir. Her olay türü belirli bir kanala yönlendirilir; kanal için webhook tanımlı değilse mesaj sistem kanalına düşer.",
        how: "Webhook adresleri veritabanında **şifreli** saklanır ve burada maskeli gösterilir. Maskeli değeri olduğu gibi bırakırsanız mevcut adres korunur.\n\n**Bir alanı boşaltmak o kanalın webhook'unu siler.** Değiştirmek istemiyorsanız alana dokunmayın.",
        action: "Kaydettikten sonra her kanalı **Test et** düğmesiyle deneyin. Test mesajı gitmiyorsa adres yanlış ya da Discord tarafında webhook silinmiş demektir.",
      }}
      actions={
        <Button
          size="sm"
          variant="amber"
          shape="rect"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      }
    >
      <Async query={query}>
        {(config) => (
          <>
            <Section title="Discord">
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setDirty(true);
                  }}
                  className="accent-[var(--brand)]"
                />
                Discord bildirimleri açık
                <InfoDot
                  text="Kapalıyken hiçbir mesaj gönderilmez. Webhook adresleri silinmez, yalnızca gönderim durur."
                  align="start"
                />
              </label>

              {!enabled && (
                <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">
                  Bildirimler kapalı. Devre kesici tetiklense bile Discord&apos;a mesaj gitmez.
                </p>
              )}
            </Section>

            <Section
              title="Kanallar"
              description="Her kanal için Discord'dan aldığınız webhook adresini yapıştırın."
            >
              <div className="space-y-3">
                {(config.channels ?? []).map((channel) => {
                  const info = channelInfo(channel);
                  const value = webhooks[channel] ?? "";
                  const configured = Boolean(value);
                  const masked = value.includes("•");

                  return (
                    <div key={channel} className="rounded-lg border border-line px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-ink">{info.label}</span>
                        <span className="font-mono text-[11px] text-ink-3">#{channel}</span>
                        <StatusPill size="sm" tone={configured ? "green" : "gray"}>
                          {configured ? "tanımlı" : "tanımsız"}
                        </StatusPill>
                        <Button
                          size="sm"
                          variant="ghost"
                          shape="rect"
                          className="ml-auto"
                          disabled={!configured || test.isPending}
                          onClick={() => test.mutate(channel)}
                        >
                          Test et
                        </Button>
                      </div>

                      <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{info.what}</p>

                      <input
                        value={value}
                        onChange={(e) => {
                          setWebhooks((w) => ({ ...w, [channel]: e.target.value }));
                          setDirty(true);
                        }}
                        placeholder="https://discord.com/api/webhooks/…"
                        className="mt-2 h-9 w-full rounded-lg border border-line bg-inset px-2.5 font-mono text-[12px] text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-brand focus:outline-none"
                      />

                      {masked && (
                        <p className="mt-1 text-[11.5px] text-ink-3">
                          Adres maskeli gösteriliyor. Dokunmazsanız mevcut adres korunur;
                          değiştirmek için tamamını yeniden yapıştırın.
                        </p>
                      )}
                      {configured && !masked && (
                        <p className="mt-1 text-[11.5px] text-warn">
                          Yeni adres girildi. Kaydedene kadar geçerli olmaz.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Toplu gönderim nasıl çalışır">
              <p className="text-[12.5px] leading-relaxed text-ink-2">
                Aynı anda çok sayıda olay üretildiğinde her biri için ayrı mesaj gönderilmez.
                Örneğin havuz yenilendiğinde 30 coin değişse bile{" "}
                <strong className="font-medium text-ink">tek bir özet mesaj</strong> gider. Bu,
                kanalı okunmaz hâle getiren bildirim yağmurunu engeller.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                Devre kesici gibi acil olaylar bu tamponlamaya girmez ve herkese haber verecek
                şekilde anında gönderilir.
              </p>
            </Section>
          </>
        )}
      </Async>
    </Page>
  );
}
