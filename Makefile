# pSSID GUI operator shortcuts.
# Run `make help` for the full list.

# Detect the compose command (plugin vs standalone).
COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
PROD  := $(COMPOSE) -f docker-compose.yml
LOCAL := $(COMPOSE) -f docker-compose.local.yml

# Edition comes from the root .env (EDITION=...). Default to "default".
EDITION ?= $(shell [ -f .env ] && sed -n 's/^EDITION=//p' .env || echo default)

.DEFAULT_GOAL := help

.PHONY: help install up down restart logs ps build dev dev-down seed-demo \
        edition-umich edition-default backup restore doctor clean

help: ## Show this help
	@echo "pSSID GUI make targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Run the installer (interactive)
	@./install.sh

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

edition-umich: ## Switch the client to the University of Michigan edition
	@$(MAKE) --no-print-directory _set-edition EDITION=umich

edition-default: ## Switch the client to the neutral default edition
	@$(MAKE) --no-print-directory _set-edition EDITION=default

_set-edition:
	@touch .env
	@grep -q '^EDITION=' .env && sed -i.bak -E 's/^EDITION=.*/EDITION=$(EDITION)/' .env || echo "EDITION=$(EDITION)" >> .env
	@rm -f .env.bak
	@echo "Edition set to '$(EDITION)'. Recreating client..."
	@EDITION=$(EDITION) $(PROD) up -d --force-recreate client
	@echo "Done. Reload the browser to see the $(EDITION) edition."

backup: ## Back up the MongoDB database
	@bash scripts/backup.sh

restore: ## Restore the MongoDB database (see scripts/restore.sh)
	@bash scripts/restore.sh

doctor: ## Check prerequisites and port availability
	@echo "Checking prerequisites..."
	@command -v docker >/dev/null 2>&1 && echo "  ok  docker: $$(docker --version | cut -d, -f1)" || echo "  ERR docker not found"
	@$(COMPOSE) version >/dev/null 2>&1 && echo "  ok  compose: $(COMPOSE)" || echo "  ERR compose not found"
	@command -v openssl >/dev/null 2>&1 && echo "  ok  openssl" || echo "  ERR openssl not found"
	@for p in 80 443 8000 8080 27017; do \
		if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$$p "; then \
			echo "  !   port $$p in use"; else echo "  ok  port $$p free"; fi; \
	done

clean: ## Stop stack and remove volumes (DANGER: deletes data)
	@$(PROD) down -v
