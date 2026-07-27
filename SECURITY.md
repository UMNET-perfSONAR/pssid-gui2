# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately, not as a public issue.

> **Before release:** replace the address below with your own, and confirm it is
> monitored. A disclosure contact that nobody reads is worse than none, because it
> stops a reporter looking for another route.

- **Email:** `security@example.edu`
- **Or:** open a [GitHub security advisory](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  on this repository.

Useful things to include: the version or commit, the deployment posture (SSO on
or off), what an attacker gains, and the smallest reproduction you have. If you
believe it is being exploited, say so in the subject line.

Please do not test against a deployment you do not operate.

## What is in scope

This application manages the configuration of wireless test probes. The findings
we care most about, roughly in order:

1. Authentication or authorization bypass — reaching data or a write without a
   mapped group, or escalating from read to write.
2. Anything that lets one user act as another: session fixation or hijacking,
   CSRF that survives the same-origin check, or a cookie that escapes its scope.
3. Injection reaching MongoDB, the generated `hosts.ini` / `pssid_config.json`,
   or the provisioning path — the last of these ends up executing against probes.
4. Secret disclosure: the OIDC client secret, the session key, or database
   credentials appearing in a response, a log line, or an image layer.
5. Container escape, or anything that turns code execution in a container into
   persistence.

Out of scope: findings that require an already-compromised host or an operator
acting against their own deployment; missing hardening headers on a deployment
that has been deliberately configured without TLS; and rate limits tuned by the
operator.

## Deployment postures

Two are supported, and which one you run changes what "unauthorized" means:

- **SSO enabled** — identity comes from an OIDC provider and group membership
  decides read or write. This is the posture to assume unless stated otherwise.
- **SSO disabled** — there is no identity. Reads are open, and `OPEN_WRITE`
  decides whether writes are too. This is intended only for a deployment that is
  access-controlled by other means, and the installer warns when it is left open.
  A report that amounts to "writes are open when OPEN_WRITE is true" is the
  documented behaviour of that posture, not a vulnerability.

## Verifying a deployment

`make security-check` inspects a running deployment from the outside — TLS
versions and cipher, security headers, whether unauthenticated and cross-origin
writes are refused, the mode of the secret file, and each container's privileges.
It exits non-zero on a failure, so it can run from CI or cron. Run it after any
change to `nginx.conf`, the compose files, or the auth configuration.

The `security` job in CI additionally validates every nginx variant with
`nginx -t`, asserts the container hardening survives into the resolved compose
output, and fails the build if a credential or a weakened default is committed.

## Security-relevant defaults

These ship closed, and CI fails if that changes:

| | Default |
|---|---|
| `ENABLE_SSO` | `false` (turn on with `make sso-on`, which refuses until the OIDC values are set) |
| `OPEN_WRITE` | `false` (read-only) |
| Session | 2 h absolute, 30 min idle, `Secure` + `HttpOnly` + `SameSite=Lax`, signed, server-side in Redis |
| Sign-in without a mapped group | Refused (`SSO_REQUIRE_GROUP=true`) |
| Containers | Non-root where the image allows, `no-new-privileges`, read-only root, capabilities dropped from client and server |
| TLS | 1.2 floor, forward-secret AEAD ciphers only, session tickets off |

## Supported versions

Security fixes are made against the default branch. There is no long-term support
branch; deploy from a current checkout and use `make upgrade`.
