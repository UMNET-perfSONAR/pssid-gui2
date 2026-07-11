# pSSID GUI operator shortcuts.
# Run `make help` for the full list.

# Detect the compose command (plugin vs standalone).
COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
PROD  := $(COMPOSE) -f docker-compose.yml
LOCAL := $(COMPOSE) -f docker-compose.local.yml

# Edition comes from the root .env (EDITION=...). Default to "default".
EDITION ?= $(shell [ -f .env ] && sed -n 's/^EDITION=//p' .env || echo default)

.DEFAULT_GOAL := help

.PHONY: help install deploy upgrade refresh up down restart logs ps build dev dev-down \
        seed-demo seed-defaults edition-umich edition-default backup restore \
        doctor clean test smoke

help: ## Show this help
	@echo "pSSID GUI make targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Run the installer (interactive)
	@./install.sh

deploy: ## Full automated deployment via Ansible (Docker, certs, stack, backups)
	@cd ansible && ansible-playbook site.yml

upgrade: ## Upgrade in place: backup, pull latest, rebuild, verify
	@cd ansible && ansible-playbook upgrade.yml

refresh: ## Apply pulled source to a RUNNING repo stack (rebuild + recreate client & server, keeps DB up)
	@echo "Rebuilding client and server images (edition: $(EDITION)); the client bundle compiles here..."
	@EDITION=$(EDITION) $(PROD) build client server
	@echo "Recreating the client and server containers (they start in seconds)..."
	@EDITION=$(EDITION) $(PROD) up -d --no-deps --force-recreate client server
	@echo "Restarting nginx so it re-resolves the new container addresses (avoids 502)..."
	@$(PROD) restart nginx 2>/dev/null || true
	@echo "Done. The new code is live once 'make ps' shows client healthy. Hard-refresh"
	@echo "the browser: Ctrl/Cmd+Shift+R."

up: ## Start the production stack (HTTPS/nginx)
	@EDITION=$(EDITION) $(PROD) up -d
	@echo "Started (edition: $(EDITION)). Use 'make logs' to follow output."

down: ## Stop the production stack
	@$(PROD) down

restart: ## Restart the production stack
	@$(PROD) down && EDITION=$(EDITION) $(PROD) up -d

logs: ## Tail logs from all services
	@$(PROD) logs -f --tail=80

ps: ## Show running containers
	@$(PROD) ps

build: ## Rebuild images from source
	@EDITION=$(EDITION) $(PROD) build

dev: ## Start the local dev stack with hot reload (http://localhost:8888)
	@EDITION=$(EDITION) $(LOCAL) up -d --build
	@echo "Dev stack up at http://localhost:8888 (edition: $(EDITION)). Edits in services/*/src hot-reload."
	@$(LOCAL) logs -f --tail=40

dev-down: ## Stop the local dev stack
	@$(LOCAL) down

seed-demo: ## Load the canonical demo dataset into the running MongoDB container
	@bash scripts/seed-demo.sh

seed-defaults: ## Load the reusable starter defaults (fresh installs)
	@bash scripts/seed-defaults.sh

test: ## Run all unit tests (server + client, no stack needed)
	@echo "== server unit tests =="
	@cd services/server && npx vitest run
	@echo "== client unit tests =="
	@cd services/client && npx vitest run

smoke: ## End-to-end test of every user action against a running stack
	@bash scripts/smoke-test.sh $(SMOKE_URL)

edition-umich: ## Switch the client to the University of Michigan edition
	@$(MAKE) --no-print-directory _set-edition EDITION=umich

edition-default: ## Switch the client to the neutral default edition
	@$(MAKE) --no-print-directory _set-edition EDITION=default

_set-edition:
	@touch .env
	@grep -q '^EDITION=' .env && sed -i.bak -E 's/^EDITION=.*/EDITION=$(EDITION)/' .env || echo "EDITION=$(EDITION)" >> .env
	@rm -f .env.bak
	@echo "Edition set to '$(EDITION)'. The edition is baked into the bundle at build"
	@echo "time, so rebuild the client image (a bare recreate would keep the old edition)..."
	@EDITION=$(EDITION) $(PROD) build client
	@echo "Recreating the client container..."
	@EDITION=$(EDITION) $(PROD) up -d --no-deps --force-recreate client
	@echo "Done. When 'make ps' shows client healthy, reload the browser to see the $(EDITION) edition."

backup: ## Back up the MongoDB database
	@bash scripts/backup.sh

restore: ## Restore the MongoDB database (see scripts/restore.sh)
	@bash scripts/restore.sh

doctor: ## Check prerequisites and port availability
	@echo "Checking prerequisites..."
	@command -v docker >/dev/null 2>&1 && echo "  ok  docker: $$(docker --version | cut -d, -f1)" || echo "  ERR docker not found"
	@$(COMPOSE) version >/dev/null 2>&1 && echo "  ok  compose: $(COMPOSE)" || echo "  ERR compose not found"
	@command -v openssl >/dev/null 2>&1 && echo "  ok  openssl" || echo "  ERR openssl not found"
	@for p in 80 443 8888; do \
		if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$$p "; then \
			echo "  !   port $$p in use"; else echo "  ok  port $$p free"; fi; \
	done
	@root=$$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker); \
	 [ -d "$$root" ] || root=/; \
	 free=$$(df -Pk "$$root" 2>/dev/null | awk 'NR==2{print int($$4/1024/1024)}'); \
	 if [ -n "$$free" ]; then \
		if [ "$$free" -lt 6 ]; then echo "  ERR disk: only $${free} GB free on $$root (build needs ~8-10 GB)"; \
		elif [ "$$free" -lt 12 ]; then echo "  !   disk: $${free} GB free on $$root (tight for the build)"; \
		else echo "  ok  disk: $${free} GB free on $$root"; fi; \
	 fi

clean: ## Stop stack and remove volumes (DANGER: deletes data)
	@$(PROD) down -v
