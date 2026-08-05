# Single sign-on at the University of Michigan

This is the deployment documentation for how SSO is actually configured on
UMich's own controllers — real values, not placeholders. It follows the same
process as [`docs/deployment-with-sso.md`](../docs/deployment-with-sso.md);
this file is what that process produced here, plus the troubleshooting that
came out of getting it right against ITS's specific Okta tenant.

If you are registering a **new** application with ITS (a different
environment, or starting over), [`QA/SSOwithOkta.md`](QA/SSOwithOkta.md) is
the request template and step-by-step runbook for that — it is deliberately
untracked (see [`../.gitignore`](../.gitignore)) since it is a working
document meant to be filled in with a specific request's values, whereas
everything on this page is UMich's committed, current configuration.

## Contents

- [Current posture](#current-posture-sso-on-one-group-writes-by-membership)
- [Turning SSO on (for a new host)](#turning-sso-on)
- [The four things most likely to go wrong](#the-four-things-most-likely-to-go-wrong)
- [The Okta secret](#the-okta-secret)

## Current posture: SSO on, one group, writes by membership

ITS registered the OIDC application **ITS - pssid development**, and everything
it returned is configured. The whole posture is in
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml) and
[`inventory.ini`](inventory.ini); the only value not in git is the client secret.

| What | Value | Where |
|---|---|---|
| Application type | **OIDC** web application, Authorization Code + PKCE, `client_secret_post` | Okta (AMP) |
| Client id | `0oa25hltopzoZr4XR1d8` — not a credential, committed on purpose | `pssid_gui_oidc_client_id` |
| Client secret | *not in git* | `group_vars/all/vault.yml` |
| Issuer | `https://okta.umich.edu/oauth2/default` — the custom authorization server named in the app's AMP record | `pssid_gui_oidc_issuer` |
| Group claim | `edumember_ismemberof` | read automatically, no setting |
| Group released | `pssid-gui-users` → **write** | `pssid_gui_auth_groups` |
| Scope | `openid profile email edumember` | `pssid_gui_sso_scope` |
| SSO enabled on | dev, qa5, qa6, qa8 (the registered redirect URIs) | per host in `inventory.ini` |

**One group means one tier.** ITS releases only `pssid-gui-users`, so everyone who
can sign in gets **write**. Mapping it to `read` instead would authenticate
everybody into an interface where nothing can be saved, which is not safer, only
broken. So membership of the `pssid-gui-users` MCommunity group *is* the access
control — treat adding someone to it as granting them the ability to reconfigure
the probes. For a viewer tier, ask ITS to release a second group and map it to
`read`.

**The AMP form is only half of it.** "Groups Released: `pssid-gui-users`" in AMP
configures the *release mechanism* — it tells Okta to put that group in the
`edumember_ismemberof` claim **for users who are in it**. It does not create the
group and it does not add anybody. Membership is granted separately, in
**MCommunity**. Until someone is a member, Okta correctly releases nothing, and
every user authenticates successfully and is then refused — with the application,
the issuer, the scopes and the AMP configuration all provably correct. That
failure is indistinguishable from a broken claim release, and it cost a long
diagnosis on qa5 to tell the two apart. Check membership first.

There are two independent gates, in two different places, and they fail at
different points:

| Gate | Configured in | Failure looks like |
|---|---|---|
| Assignment Groups (`RegularStaffAA`, …) | AMP | Refused at Okta, before reaching the application |
| `pssid-gui-users` membership | MCommunity | Signs in fine, then the application's "Access denied" page |

`pssid_gui_open_write` is now `false`. It is never consulted on a host with SSO
on, so it governs only unregistered hosts — and those cannot authenticate anyone,
so read-only is the right resting state. `make sso-status` on a host reports
what is actually in force.

## Turning SSO on

For a new UMich host, or to re-verify an existing one. Two things are needed: the
secret in a vault, and a first deploy.

```bash
ansible-vault create umich/group_vars/all/vault.yml
```

```yaml
---
pssid_gui_oidc_client_secret: <the secret from ITS>
```

The client id is **not** in there — it is committed, because a client id travels
in the browser's URL bar on every sign-in and protecting it protects nothing.
Keeping the vault to a single value removes any doubt about what actually matters.

Deploy **one host first**, so a mistake costs one controller rather than three:

```bash
make deploy-umich ANSIBLE_ARGS="--limit pssid-gui-qa6.miserver.it.umich.edu --ask-vault-pass"
```

Verify on that host before the others:

1. Sign in — Okta, then back to the dashboard with your name in the navigation bar.
2. Open `/api/userinfo`. `groups` must contain `pssid-gui-users` and
   `access_level` must be `write`.
3. Sign out, revisit, and you are asked to authenticate again.
4. `make security-check` passes.

Then drop the `--limit`.

### The four things most likely to go wrong

Each has a different symptom, so the symptom tells you which one it is.

**`invalid_scope` at Okta, before any password prompt.** Specifically
`Custom scopes are not allowed for this request.` — `https://okta.umich.edu` is
the **org** authorization server (no `/oauth2/...` path), and an org server
accepts only the scopes OIDC itself defines. Any custom scope fails every
sign-in. `pssid_gui_sso_scope` must therefore stay
`openid profile email`; anything beyond the standard set needs a custom
authorization server from ITS. This was hit for real on qa5 with
`edumember` in the scope.

Losing that scope does not necessarily lose the group claim: on an org server the
claim is released by the application's token configuration, not the scope. Step 2
above (`/api/userinfo`) is what tells you whether it arrived — check, rather than
assume either way.

**The server refuses to start**, so nginx never starts either (it waits on the
server being healthy) and a deploy fails its health check with a refused
connection rather than an HTTP error. The server is rejecting a setting on
purpose and names which:

```bash
docker compose logs server | grep -E 'SSO enabled|REFUSING TO START' -A3
```

It is **not** the issuer. A wrong issuer passes the startup checks — they only
require a valid `https` URL with no path — and `express-openid-connect`
discovers lazily, on the first request that needs the provider, so the stack
comes up healthy and fails at sign-in instead. Read the named setting and fix
that one. `REDIS_URL carries no password` is worth knowing about specifically:
that value is assembled by compose from `REDIS_PASSWORD` in the **root** `.env`,
not from `services/server/.env`, so it is empty whenever that one line is
missing — and it is only ever consulted with SSO on, which is why a deployment
that was fine without SSO fails the moment it is switched on.

**Sign-in fails at Okta, or every session is rejected.** This is where a wrong
**issuer** surfaces, because the value we send must equal the tenant's own
`issuer` string exactly. Confirm it against the tenant rather than assuming:

```bash
curl -s https://okta.umich.edu/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

Note the domain is `okta.umich.edu`, not the `umich.okta.com` the vendor's usual
naming suggests — both resolve, so getting this wrong looks like a working
configuration right up until someone tries to sign in. If ITS ever moves the
application to a custom authorization server (a URL with an `/oauth2/...` path),
set that here and confirm `edumember_ismemberof` is released on *that* server,
since claims configured on the org authorization server are not emitted by a
custom one.

**Sign-in works, then "not a member of any group permitted".** The claim did not
arrive, or its contents do not match `pssid-gui-users`. To see exactly what Okta
sent without locking yourself out, set `SSO_REQUIRE_GROUP=false` in
`services/server/.env`, `make restart`, sign in, and read `/api/userinfo`.
**Set it back to `true` afterwards.**

## The Okta secret

`group_vars/pssid_gui.yml` is committed, so the client secret does not belong in
it. Keep it in an encrypted vault file, which `.gitignore` keeps untracked:

```bash
ansible-vault create umich/group_vars/all/vault.yml
```

The `all/` subdirectory is not decoration. Ansible maps a file
`group_vars/<name>.yml` to a **group** called `<name>`, so a file named
`group_vars/vault.yml` would be read as variables for a group called `vault` —
which does not exist, so it would be **silently ignored** and the deploy would
run with no client credentials. `group_vars/all/` is a directory form: every file
in it applies to every host in this inventory, whatever it is called.

```yaml
---
pssid_gui_oidc_client_secret: <from ITS>
```

One value, not two: the client id is committed in
[`group_vars/pssid_gui.yml`](group_vars/pssid_gui.yml).

Then deploy with `--ask-vault-pass` as shown above. Where it lands, and what
touches it on the way:

| Stage | Handling |
|---|---|
| Ansible → installer | The **environment**, never argv. `/proc/<pid>/cmdline` is world-readable, so `--client-secret=…` would let any local user read it with `ps` for the length of the install |
| Ansible output | `no_log` on that task — never printed, even on failure |
| At rest | `services/server/.env`, root-owned **mode 640**, readable only by the server container's supplementary gid |
| Later runs | Preserved automatically; upgrades neither erase it nor need it re-supplied |

**Do not** pass it as `-e pssid_gui_oidc_client_secret=...`. That puts it in your
shell history and in `ps` output for every local user. If you must deploy without
a vault, export it instead — the role reads it from the environment:

```bash
read -rs PSSID_OIDC_CLIENT_SECRET && export PSSID_OIDC_CLIENT_SECRET
make deploy-umich ANSIBLE_ARGS="--limit pssid-gui-qa6.miserver.it.umich.edu"
```

**Rotation.** Have ITS issue the new secret *while the old one still works*,
update the vault, redeploy, confirm a real sign-in, then ask them to retire the
old one. The reverse order takes every host down in between.

**If it leaks.** Rotate as above and tell ITS. It is not a password: the
Authorization Code flow still requires a code delivered to one of the three
registered redirect URIs, PKCE means an intercepted code cannot be redeemed
without the verifier, and no grant type is enabled that would let the secret mint
a token on its own. Serious hygiene failure, not an access breach — but if it ever
reached a git commit, rotation is mandatory and rewriting history does not help.

Requesting the application from ITS in the first place — which values they need
from you and which they return — is [`QA/SSOwithOkta.md`](QA/SSOwithOkta.md). That
file is deliberately untracked: it is a working document you fill in with the
tenant's real ids and group names. The vendor-neutral version of the same
material is [`../docs/deployment-with-sso.md`](../docs/deployment-with-sso.md)
and [`../docs/deployment.md#single-sign-on`](../docs/deployment.md#single-sign-on).
