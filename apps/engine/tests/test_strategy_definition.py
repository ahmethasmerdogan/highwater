def test_giris_saati_penceresi_tek_karar_yolu():
    """entry.hours_utc: None = her saat; liste = yalnız o UTC saatleri.
    Worker ve backtest aynı fonksiyonu çağırır (kural 1)."""
    from datetime import UTC, datetime

    from sarnic.strategy.definition import EntrySpec, StrategyDefinition, entry_hour_allowed

    her = EntrySpec()
    assert entry_hour_allowed(her, datetime(2026, 9, 3, 7, tzinfo=UTC))
    gece = EntrySpec(hours_utc=[0, 1, 2, 3, 4, 5, 22, 23])
    assert entry_hour_allowed(gece, datetime(2026, 9, 3, 3, tzinfo=UTC))
    assert not entry_hour_allowed(gece, datetime(2026, 9, 3, 12, tzinfo=UTC))
    # Tanım hash'i düğmeyi görür; doğrulama saçma değeri reddeder.
    d = StrategyDefinition.from_dict({"entry": {"hours_utc": [0, 1, 2]}})
    assert d.hash() != StrategyDefinition().hash()
    import pytest

    with pytest.raises(ValueError):
        StrategyDefinition.from_dict({"entry": {"hours_utc": [25]}}).require_valid()
    with pytest.raises(ValueError):
        StrategyDefinition.from_dict({"entry": {"hours_utc": []}}).require_valid()


def test_negatif_aile_agirligi_reddedilir():
    """Negatif ağırlık puan ölçeğini bozar: taban [0,100] dışına çıkar, clamp
    eşitlik yaratır ve seçim alfabetik sıraya düşer (bot 20, 2026-09-04)."""
    import pytest

    from sarnic.strategy.definition import StrategyDefinition, StrategyValidationError

    d = StrategyDefinition.from_dict(
        {"scoring": {"weights": {"trend": -15, "momentum": -15, "vol": 40, "flow": 20, "sr": 10}}}
    )
    hatalar = d.validate()
    assert any("negatif olamaz" in h for h in hatalar), hatalar
    with pytest.raises(StrategyValidationError):
        d.require_valid()
    # Pozitif ağırlıklar sorunsuz.
    StrategyDefinition.from_dict(
        {"scoring": {"weights": {"trend": 15, "momentum": 15, "vol": 40, "flow": 20, "sr": 10}}}
    ).require_valid()
