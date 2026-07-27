# pSSID GUI operator shortcuts.
# Run `make help` for the full list.

# Detect the compose command (plugin vs standalone).
COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
PROD  := $(COMPOSE) -f docker-compose.yml
LOCAL := $(COMPOSE) -f docker-compose.local.yml

# Edition comes from the root .env (EDITION=...). Default to "default".
EDITION ?= $(shell [ -f .env ] && sed -n 's/^EDITION=//p' .env || echo default)

.DEFAULT_GOAL := help

.PHONY: help install deploy deploy-umich upgrade upgrade-umich refresh up down restart logs ps build dev dev-down \
        seed-defaults seed-qa edition-default edition-umich backup restore \
        sso-on sso-off sso-status \
        doctor clean test smoke security-check

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

deploy-umich: ## Deploy the UMich controllers from umich/inventory.ini
	@cd ansible && ansible-playbook -i ../umich/inventory.ini site.yml $(ANSIBLE_ARGS)

upgrade-umich: ## Upgrade the UMich controllers from umich/inventory.ini
	@cd ansible && ansible-playbook -i ../umich/inventory.ini upgrade.yml $(ANSIBLE_ARGS)

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

seed-defaults: ## Load the pre-load starter data (fresh installs)
	@bash scripts/seed-defaults.sh

seed-qa: ## Add the QA dataset on top of the pre-load (manual; see umich/QA/QA.md)
	@bash umich/QA/seed-qa.sh

test: ## Run all unit tests (server + client, no stack needed)
	@echo "== server unit tests =="
	@cd services/server && npx vitest run
	@echo "== client unit tests =="
	@cd services/client && npx vitest run

smoke: ## End-to-end test of every user action against a running stack
	@bash scripts/smoke-test.sh $(SMOKE_URL)

security-check: ## Verify the security posture of a running deployment (TLS, headers, auth, containers)
	@bash scripts/security-check.sh $(SECURITY_URL)

edition-default: ## Switch the client to the neutral default edition
	@$(MAKE) --no-print-directory _set-edition EDITION=default

edition-umich: ## Switch the client to the UMich (navy/maize) edition
	@$(MAKE) --no-print-directory _set-edition EDITION=umich

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

# ─── Auth posture ────────────────────────────────────────────────────────────
# ENABLE_SSO is the single on/off switch for single sign-on, and it ships OFF.
# It lives in the two places install.sh writes, and they must move together:
#
#   .env             read by Docker Compose and passed to the server, which
#                    resolves it at runtime (shared/accessControl.ts)
#   shared/config.ts the compiled default the browser bundle carries
#
# If only one moves, the API and the interface disagree about who may do what.
# These targets move both and rebuild, so turning SSO on later is one command
# rather than a full re-run of install.sh.
SERVER_ENV := services/server/.env

sso-status: ## Show whether SSO is on, in config, in .env, and on the running stack
	@printf "  shared/config.ts  "; grep -oE 'ENABLE_SSO:[[:space:]]*(true|false)' shared/config.ts 2>/dev/null || echo "(not found)"
	@printf "  root .env         "; grep -oE '^ENABLE_SSO=.*' .env 2>/dev/null || echo "ENABLE_SSO= (unset -> compiled default)"
	@printf "  running server    "; curl -sk https://localhost/api/userinfo 2>/dev/null | grep -oE '"sso_enabled":(true|false)' || echo "(stack not reachable)"

sso-on: ## Turn single sign-on ON (needs the OIDC values in services/server/.env)
	@$(MAKE) --no-print-directory _set-sso SSO=true

sso-off: ## Turn single sign-on OFF (site is unauthenticated; OPEN_WRITE governs writes)
	@$(MAKE) --no-print-directory _set-sso SSO=false

_set-sso:
	@if [ "$(SSO)" = "true" ]; then \
	  missing=""; \
	  for k in ISSUER_BASE_URL CLIENT_ID CLIENT_SECRET SECRET; do \
	    v="$$(sed -n "s/^$$k=//p" $(SERVER_ENV) 2>/dev/null)"; \
	    case "$$v" in \
	      ""|*your-client*|*replace-with*|*idp.example.com*) missing="$$missing $$k" ;; \
	    esac; \
	  done; \
	  if [ -n "$$missing" ]; then \
	    echo "Refusing to turn SSO on. Not set in $(SERVER_ENV):$$missing"; \
	    echo ""; \
	    echo "The server fails closed on an incomplete OIDC config: it would refuse"; \
	    echo "to boot and take the site down with it. Fill those in first (see"; \
	    echo "docs/deployment.md#single-sign-on), then re-run 'make sso-on'."; \
	    exit 1; \
	  fi; \
	fi
	@touch .env
	@grep -q '^ENABLE_SSO=' .env && sed -i.bak -E 's/^ENABLE_SSO=.*/ENABLE_SSO=$(SSO)/' .env || echo "ENABLE_SSO=$(SSO)" >> .env
	@sed -i.bak -E 's/(ENABLE_SSO:[[:space:]]*)(true|false)/\1$(SSO)/' shared/config.ts
	@rm -f .env.bak shared/config.ts.bak
	@echo "ENABLE_SSO=$(SSO) in both the root .env and shared/config.ts."
	@echo "The flag is compiled into the browser bundle, so rebuilding the client"
	@echo "(a bare recreate would keep the old posture)..."
	@EDITION=$(EDITION) $(PROD) build client
	@echo "Recreating the client and server containers..."
	@EDITION=$(EDITION) $(PROD) up -d --no-deps --force-recreate client server
	@$(PROD) restart nginx 2>/dev/null || true
	@echo ""
	@echo "Done. Verify with 'make sso-status' once 'make ps' shows client healthy."
	@echo "With SSO off, OPEN_WRITE in the root .env decides whether the interface"
	@echo "is read-only or writable."

backup: ## Back up the MongoDB database
	@bash scripts/backup.sh

restore: ## Restore the MongoDB database (see scripts/restore.sh)
	@bash scripts/restore.sh

doctor: ## Check prerequisites and port availability
	@echo "Checking prerequisites..."
	@command -v docker >/dev/null 2>&1 && echo "  ok  docker: $$(docker --version | cut -d, -f1)" || echo "  ERR docker not found"
	@if docker compose version >/dev/null 2>&1; then echo "  ok  compose: docker compose (v2)"; \
	 elif command -v docker-compose >/dev/null 2>&1; then \
	   echo "  ERR compose: only standalone docker-compose (v1) found - NOT supported."; \
	   echo "      v1 cannot build this project's compose file. Install the plugin:"; \
	   echo "      apt-get update && apt-get install -y docker-compose-plugin"; \
	 else echo "  ERR compose not found"; fi
	@command -v openssl >/dev/null 2>&1 && echo "  ok  openssl" || echo "  ERR openssl not found"
	@for p in 80 443 8888; do \
		if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$$p "; then \
			echo "  !   port $$p in use"; else echo "  ok  port $$p free"; fi; \
	done
	@bash -c '. scripts/lib/preflight.sh; check_disk'

clean: ## Stop stack and remove volumes (DANGER: deletes data)
	@$(PROD) down -v
