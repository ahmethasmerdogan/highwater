"use client";

/**
 * Yönetim › Entegrasyonlar (DESIGN-V3 §4.9) — Discord kanalları.
 *
 * Webhook adresleri şifreli tutulur ve **maskeli** gösterilir. Maskeli
 * değeri geri göndermek mevcut adresi korur; alanı boşaltmak siler.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field as UiField, StatusPill, Switch } from "uicean";
import { api, type DiscordConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import { GuideSection } from "@/shell/page";
import { Alert, Async, Button, InfoDot, NumText, Panel, TextInput } from "@/design";

/** Kanalların ne taşıdığı — motorun yönlendirme tablosunun karşılığı. */
const CHANNEL_INFO: Record<string, { label: string; what: string }> = {
  islemler: { label: "İşlemler", what: "Pozisyon açılışı, kapanışı ve reddedilen emirler." },
  havuz: { label: "Havuz", what: "Havuz güncellemeleri ve puan eşiği aşımları; yenilemede tek özet mesaj gider." },
  alarm: { label: "Alarm", what: "Devre kesiciler, bayat veri ve borsa erişim engeli. Herkese haber verir." },
  sistem: { label: "Sistem", what: "Bot durum değişiklikleri ve genel işleyiş. Eşlenmemiş olaylar da buraya düşer." },
};

function channelInfo(key: string) {
  return CHANNEL_INFO[key] ?? { label: key, what: "Bu kanalın açıklaması yazılmamış." };
}

export const ENTEGRASYONLAR = {
  summary: "Discord bildirim kanalları. Sistemin ürettiği olaylar buraya yönlendirilir.",
  guide: (
    <>
      <GuideSection title="Nasıl okunur">
        <p>
          Webhook adresleri <strong>şifreli</strong> saklanır ve maskeli gösterilir. Maskeli değeri olduğu gibi
          bırakırsanız mevcut adres korunur. <strong>Bir alanı boşaltmak o kanalın webhook&apos;unu siler.</strong>
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>Kaydettikten sonra her kanalı “Test et” ile deneyin. Mesaj gitmiyorsa adres yanlış ya da Discord tarafında silinmiş demektir.</p>
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

  /* Sunucudan gelen değerleri forma yükle — kullanıcı yazmaya başlamadıysa. */
  useEffect(() => {
    if (query.data && !dirty) {
      setEnabled(query.data.enabled);
      setWebhooks(query.data.webhooks ?? {});
    }
  }, [query.data, dirty]);

  const save = useMutation({
    /* Uç `webhooks` bekler; `channels` göndermek hiçbir webhook'un kaydolmamasına yol açar. */
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
      api.post<{ sent: boolean; message: string }>(`/integrations/discord/test?channel=${encodeURIComponent(channel)}`),
    onSuccess: (result) => {
      if (result.sent) toast.success("Test mesajı gönderildi", result.message);
      else toast.warning("Test mesajı gitmedi", result.message);
    },
    onError: (error: Error) => toast.error("Test başarısız", error.message),
  });

  return (
    <Async query={query}>
      {(config) => (
        <Panel
          title="Discord"
          description="Her kanal için Discord'dan aldığınız webhook adresini yapıştırın."
          padded={false}
          actions={
            <Button size="sm" variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          }
        >
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink">
              Discord bildirimleri
              <InfoDot text="Kapalıyken hiçbir mesaj gönderilmez. Webhook adresleri silinmez, yalnızca gönderim durur." />
            </span>
            <Switch
              checked={enabled}
              label="Discord bildirimleri"
              onChange={(next) => {
                setEnabled(next);
                setDirty(true);
              }}
            />
          </div>
          {!enabled && (
            <div className="px-5 pt-4">
              <Alert tone="warn">Bildirimler kapalı. Devre kesici tetiklense bile Discord&apos;a mesaj gitmez.</Alert>
            </div>
          )}

          <ul>
            {(config.channels ?? []).map((channel) => {
              const info = channelInfo(channel);
              const value = webhooks[channel] ?? "";
              const configured = Boolean(value);
              const masked = value.includes("•");
              return (
                <li key={channel} className="border-b border-line px-5 py-4 last:border-0">
                  <UiField
                    label={
                      <span className="inline-flex items-center gap-2">
                        {info.label}
                        <NumText text={`#${channel}`} size="xs" />
                        <StatusPill tone={configured ? "green" : "gray"} size="sm">{configured ? "tanımlı" : "tanımsız"}</StatusPill>
                      </span>
                    }
                    hint={
                      masked
                        ? "Adres maskeli. Dokunmazsanız mevcut adres korunur; değiştirmek için tamamını yeniden yapıştırın."
                        : configured
                          ? "Yeni adres girildi. Kaydedene kadar geçerli olmaz."
                          : info.what
                    }
                  >
                    {(p) => (
                      <span className="flex items-center gap-2">
                        <TextInput
                          {...p}
                          value={value}
                          onChange={(event) => {
                            setWebhooks((current) => ({ ...current, [channel]: event.target.value }));
                            setDirty(true);
                          }}
                          placeholder="https://discord.com/api/webhooks/…"
                          className="sn-num"
                        />
                        <Button size="sm" variant="neutral" disabled={!configured || test.isPending} onClick={() => test.mutate(channel)}>
                          Test et
                        </Button>
                      </span>
                    )}
                  </UiField>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </Async>
  );
}
