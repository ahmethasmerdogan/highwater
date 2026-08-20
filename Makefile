# SARNIÇ — sık kullanılan komutlar.
# Not: Panel komutları Türkçe karakter içeren yollarda çalışmaz; bkz. README.

ENGINE := apps/engine
WEB    := apps/web

.PHONY: help up down logs migrate bootstrap test lint fmt api tui web build ci \
        terminal terminal-log terminal-autostart terminal-autostart-off \
        yedek yedek-prova

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up:        ## Geliştirme yığınını başlat (postgres + redis + api + panel)
	docker compose --profile dev up -d

down:      ## Her şeyi durdur
	docker compose --profile dev --profile engine down

logs:      ## Servis loglarını izle
	docker compose logs -f

migrate:   ## Migrasyonları uygula
	cd $(ENGINE) && uv run alembic upgrade head

bootstrap: ## İlk yönetici + varsayılan strateji
	cd $(ENGINE) && uv run python -m sarnic.cli bootstrap

test:      ## Motor testleri
	cd $(ENGINE) && uv run pytest tests -q

cov:       ## Kapsam raporu
	cd $(ENGINE) && uv run pytest tests -q --cov=sarnic --cov-report=term-missing

lint:      ## Lint (motor + panel)
	cd $(ENGINE) && uv run ruff check sarnic tests alembic
	cd $(WEB) && npm run typecheck

fmt:       ## Biçimlendir
	cd $(ENGINE) && uv run ruff format sarnic tests alembic

api:       ## FastAPI'yi yerelde çalıştır
	cd $(ENGINE) && uv run python -m sarnic.cli api --reload

tui:       ## Terminal arayüzü (bu pencerede)
	cd $(ENGINE) && uv run python -m sarnic.cli tui

terminal:  ## Canlı akışı AYRI bir pencerede aç (TUI)
	scripts/open-terminal.sh tui

terminal-log: ## Servis loglarını ayrı bir pencerede aç
	scripts/open-terminal.sh log

terminal-autostart: ## Oturum açılışında terminali otomatik aç
	mkdir -p $(HOME)/.config/autostart
	cp scripts/sarnic-terminal.desktop $(HOME)/.config/autostart/
	@echo "Kuruldu: $(HOME)/.config/autostart/sarnic-terminal.desktop"

yedek:     ## PostgreSQL yedeği al (gecelik timer bunu çağırır)
	scripts/yedek-al.sh

yedek-prova: ## Son yedeği ayrı bir veritabanına geri yükleyip doğrula
	scripts/yedek-prova.sh

terminal-autostart-off: ## Otomatik açılışı kaldır
	rm -f $(HOME)/.config/autostart/sarnic-terminal.desktop
	@echo "Kaldırıldı."

web:       ## Paneli yerelde çalıştır (ASCII yol gerekir)
	cd $(WEB) && npm run dev

build:     ## Docker imajlarını derle
	docker compose --profile dev --profile engine build

ci:        ## CI'ın çalıştırdığının aynısı
	cd $(ENGINE) && uv run ruff check sarnic tests alembic && uv run ruff format --check sarnic tests && uv run pytest tests -q
