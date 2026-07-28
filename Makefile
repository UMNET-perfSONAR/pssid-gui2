# pSSID GUI operator shortcuts.
# Run `make help` for the full list.

# Detect the compose command (plugin vs standalone).
COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

# The compose profile the current auth posture requires.
#
# redis is profile-gated to `sso` (docker-compose.yml) and it holds the session
# store, so with SSO on the server connects to it at startup and EXITS when it
# cannot -- the container then crash-loops and nginx has no upstream. Bringing
# the stack up without this flag therefore takes an authenticated site down,
# which is what `make up`, `make restart` and `make refresh` all used to do
# after install.sh had correctly started redis with `--profile sso`.
#
# Read from the root .env, the file install.sh and _set-sso both write, so the
# profile follows the posture automatically and no target has to remember it.
SSO_PROFILE := $(shell [ -f .env ] && sed -n 's/^ENABLE_SSO=//p' .env | tail -1 | grep -qiE '^(1|true|yes|on)$$' && echo --profile sso)
PROD  := $(COMPOSE) -f docker-compose.yml $(SSO_PROFILE)
LOCAL := $(COMPOSE) -f docker-compose.local.yml

# Edition comes from the root .env (EDITION=...). Default to "default".
EDITION ?= $(shell [ -f .env ] && sed -n 's/^EDITION=//p' .env || echo default)

.DEFAULT_GOAL := help

.PHONY: help install deploy deploy-umich upgrade upgrade-umich refresh up down restart logs ps build dev dev-down \
        seed-defaults seed-qa edition-default edition-umich backup restore \
        sso-on sso-off sso-status writes-on writes-off \
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
#
# OPEN_WRITE is the second switch, and it only applies while SSO is OFF: it says
# whether the unauthenticated site is read-only or writable, and it ships closed.
# writes-on/writes-off below flip it, because otherwise "turn SSO off" leaves a
# read-only site with no way back short of re-running the installer -- which is
# a working deployment where nothing can be edited and nothing says why.
SERVER_ENV := services/server/.env

sso-status: ## Show the auth posture: SSO, and the write policy that applies while it is off
	@printf "  shared/config.ts  "; grep -oE 'ENABLE_SSO:[[:space:]]*(true|false)' shared/config.ts 2>/dev/null || echo "(not found)"
	@printf "  root .env         "; grep -oE '^ENABLE_SSO=.*' .env 2>/dev/null || echo "ENABLE_SSO= (unset -> compiled default)"
	@printf "  writes (.env)     "; grep -oE '^OPEN_WRITE=.*' .env 2>/dev/null || echo "OPEN_WRITE= (unset -> compiled default: read-only)"
	@printf "  running server    "; body="$$(curl -sk https://localhost/api/userinfo 2>/dev/null)"; \
	  case "$$body" in \
	    *'"sso_enabled":true'*)  echo '"sso_enabled":true' ;; \
	    *'"sso_enabled":false'*) echo '"sso_enabled":false' ;; \
	    *login_url*|*'not authenticated'*) echo 'on (/api requires authentication, so anonymous curl gets 401)' ;; \
	    "") echo "(stack not reachable)" ;; \
	    *) echo "(unrecognised response)" ;; \
	  esac
	@printf "  running writes    "; body="$$(curl -sk https://localhost/api/userinfo 2>/dev/null)"; \
	  case "$$body" in \
	    *'"access_level":"write"'*) echo 'writable ("access_level":"write")' ;; \
	    *'"access_level":"read"'*)  echo 'READ-ONLY ("access_level":"read") -- "make writes-on" opens it' ;; \
	    *'"access_level":"none"'*)  echo 'no access ("access_level":"none")' ;; \
	    *login_url*|*'not authenticated'*) echo '(SSO on: group membership decides, not OPEN_WRITE)' ;; \
	    "") echo "(stack not reachable)" ;; \
	    *) echo "(not reported by this server)" ;; \
	  esac

sso-on: ## Turn single sign-on ON (needs the OIDC values in services/server/.env)
	@$(MAKE) --no-print-directory _set-sso SSO=true

sso-off: ## Turn single sign-on OFF (site is unauthenticated; OPEN_WRITE governs writes)
	@$(MAKE) --no-print-directory _set-sso SSO=false

# The posture this run is SETTING, which is not the one $(SSO_PROFILE) above
# read: that was resolved when make parsed this file, and the recipe below
# rewrites .env before it brings anything up. Recursively expanded (=) so both
# read $(SSO) from the sub-make.
NEW_SSO_PROFILE = $(if $(filter true,$(SSO)),--profile sso)
# redis is named explicitly. `up --no-deps --force-recreate <services>` starts
# only the services listed, profile active or not, so turning SSO on without it
# leaves the server with no session store -- and the server exits at startup
# when it cannot reach one.
NEW_SSO_SERVICES = $(if $(filter true,$(SSO)),redis client server,client server)

_set-sso:
	@if [ "$(SSO)" = "true" ]; then \
	  if [ ! -e $(SERVER_ENV) ]; then \
	    echo "Refusing to turn SSO on: $(SERVER_ENV) does not exist."; \
	    echo "Run ./install.sh first -- it generates that file."; \
	    exit 1; \
	  fi; \
	  if [ ! -r $(SERVER_ENV) ]; then \
	    echo "Cannot read $(SERVER_ENV) (install.sh leaves it root-owned, mode 640)."; \
	    echo "Re-run as root so the OIDC values can be checked:  sudo make sso-on"; \
	    exit 1; \
	  fi; \
	  missing=""; \
	  for k in ISSUER_BASE_URL CLIENT_ID CLIENT_SECRET SECRET; do \
	    v="$$(sed -n "s/^$$k=//p" $(SERVER_ENV))"; \
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
	@EDITION=$(EDITION) $(COMPOSE) -f docker-compose.yml $(NEW_SSO_PROFILE) build client
	@echo "Recreating the containers this posture needs..."
	@EDITION=$(EDITION) $(COMPOSE) -f docker-compose.yml $(NEW_SSO_PROFILE) up -d --no-deps --force-recreate $(NEW_SSO_SERVICES)
	@$(COMPOSE) -f docker-compose.yml restart nginx 2>/dev/null || true
	@echo ""
	@echo "Done. Verify with 'make sso-status' once 'make ps' shows client healthy."
	@if [ "$(SSO)" = "false" ]; then \
	  ow="$$(sed -n 's/^OPEN_WRITE=//p' .env | tail -1)"; \
	  if printf '%s' "$$ow" | grep -qiE '^(1|true|yes|on)$$'; then \
	    echo "SSO is off and OPEN_WRITE=true: anyone who can reach the site can edit it,"; \
	    echo "so the network in front of it is now the access control. 'make writes-off'"; \
	    echo "returns it to read-only."; \
	  else \
	    echo "SSO is off and OPEN_WRITE=$${ow:-<unset, defaults false>}, so the site is"; \
	    echo "READ-ONLY: every form is greyed out and every save returns 403. Run"; \
	    echo "'make writes-on' to make the interface usable while SSO is off."; \
	  fi; \
	fi

# The other half of the posture: who may WRITE while SSO is off.
#
# Deliberately not symmetrical with _set-sso above, in two ways:
#
#   * Only the root .env moves. shared/config.ts keeps OPEN_WRITE=false, which CI
#     asserts, and that is not a desync: the browser prefers the access_level the
#     SERVER reports through /api/userinfo, resolved from this environment
#     variable per request (services/client/src/utils/formControl.ts). The
#     compiled value is only the fallback for a server too old to report one.
#   * No client rebuild, for the same reason -- the bundle carries no copy of this
#     decision. Recreating the server is enough for compose to pass the new value,
#     and nginx is restarted after it because it caches the upstream address and
#     a recreated container has a new one (the 502 `make refresh` also works around).
writes-on: ## Allow writes while SSO is off (OPEN_WRITE=true; the site is then unauthenticated AND writable)
	@$(MAKE) --no-print-directory _set-open-write OPEN_WRITE=true

writes-off: ## Make the site read-only while SSO is off (OPEN_WRITE=false, the shipped default)
	@$(MAKE) --no-print-directory _set-open-write OPEN_WRITE=false

_set-open-write:
	@touch .env
	@if sed -n 's/^ENABLE_SSO=//p' .env | tail -1 | grep -qiE '^(1|true|yes|on)$$'; then \
	  echo "Note: SSO is ON, and OPEN_WRITE is never consulted in that posture --"; \
	  echo "group membership decides read vs write (shared/auth-groups.config.json)."; \
	  echo "Setting it anyway, so it is already right if SSO is turned off later."; \
	fi
	@grep -q '^OPEN_WRITE=' .env && sed -i.bak -E 's/^OPEN_WRITE=.*/OPEN_WRITE=$(OPEN_WRITE)/' .env || echo "OPEN_WRITE=$(OPEN_WRITE)" >> .env
	@rm -f .env.bak
	@echo "OPEN_WRITE=$(OPEN_WRITE) in the root .env."
	@echo "Recreating the server so compose passes it the new value..."
	@EDITION=$(EDITION) $(PROD) up -d --no-deps --force-recreate server
	@echo "Restarting nginx so it re-resolves the new container address (avoids 502)..."
	@$(PROD) restart nginx 2>/dev/null || true
	@echo ""
	@if [ "$(OPEN_WRITE)" = "true" ]; then \
	  echo "Done. The interface is writable to anyone who can reach it. Reload the"; \
	  echo "browser (Ctrl/Cmd+Shift+R) and the forms come alive."; \
	else \
	  echo "Done. The interface is read-only. Reload the browser to see the forms"; \
	  echo "greyed out."; \
	fi
	@echo "Verify with 'make sso-status', or: curl -sk https://localhost/api/userinfo"

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
