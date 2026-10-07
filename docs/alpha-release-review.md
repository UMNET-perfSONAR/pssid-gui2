# pSSID GUI: alpha release review

Date: 2026-10-06  
Reviewed baseline: `2f7e9c583d85a1d9ca11f2e8c329ab94442ef470`, plus the local fixes described below.

## Recommendation

Proceed to a controlled lab acceptance run after these changes are reviewed and
merged. Full release sign-off remains pending the real identity-provider,
controller installation/upgrade, and physical-probe checks below. Passing the
local tests does not establish that every possible bug has been eliminated.

The supplied attachment contained excerpts about an earlier report, not its full
test results. Its linked artifact was inaccessible. This assessment uses fresh
checks of the repository and disposable local containers; it does not rely on
the earlier report's claims.

## Defects corrected

| Finding | Result |
| --- | --- |
| Browser writes on non-default local ports returned 403 because nginx removed the port from the forwarded Host header. | Preserve the original Host header. Browser create/edit now return 200; smoke tests now include Origin headers. |
| Cron validation accepted zero steps and repeated slashes, including `*/0` and `*/5/2`. | Reject these in both the form and API; regression tests cover both. |
| A queued automatic provision could execute after the setting was disabled. | Recheck the persisted setting immediately before starting the run. |
| Deleting an object named `config` was mistaken for explicit provisioning. | Only POST provisioning endpoints are excluded from automatic refreshes. |
| The second branch of `probe|sensor` could match inside a hostname, unlike the daemon's start-anchored matching. | Anchor the entire expression, including every alternative. |
| Backup/restore chose the first globally matching MongoDB container. | Resolve the current Compose project's mongo service or an explicit `PSSID_DB_CONTAINER`. Controller upgrades resolve their own database. |
| Failed backups left apparently restorable archives; concurrent backups could overwrite one another. | Use unique temporary archives, remove failed output, and publish only after successful completion. |
| Restricted networks displayed icon names instead of icons because fonts came from Google. | Bundle Material Icons and Poppins with the client. |

Compatible dependency updates also removed the reported production dependency
advisories. No forced major-version changes were used.

## Verification

| Check | Result |
| --- | --- |
| Server unit/regression tests | 346 passed across 15 files. |
| Client unit/regression tests | 232 passed across 11 files. |
| Server and client TypeScript checks | Passed. |
| Production builds | Server and client build successfully, including Docker builds using Node 22. |
| API smoke suite | All 75 checks passed against disposable MongoDB, production app images, and local nginx, including browser-style Origin headers. |
| Browser workflows | Schedule creation, editing, deletion with confirmation, and invalid-cron rejection verified. Primary application pages load without captured JavaScript page errors. |
| Default read-only policy | Health and reads return 200; unauthenticated writes return 403. Hardened read-only server container starts successfully. |
| Database recovery | A test record was backed up, changed, restored, and verified at its original value; MongoDB restored indexes without failures. |
| Backup regressions | Project targeting, explicit override, missing/ambiguous service, unique archives, failed-output cleanup, and restore invocation passed with a mocked Docker command. Added to CI. |
| Deployment checks | Both Compose files parse; shell syntax, changed-script ShellCheck, and local nginx configuration validation passed. |
| Dependency audit | Zero reported vulnerabilities in both production dependency trees at review time. |

All database mutations and provisioning smoke tests used disposable local data.
The provision executable was the shipped stub; no real probes were contacted.
The smoke run did not exercise a complete production TLS/SSO Compose deployment.

## Remaining release gates

1. **Real SSO:** verify login, callback, logout, expired sessions, rejected users,
   read-only users, write users, actual group claims, and Redis-backed sessions
   against the intended provider. Unit tests cover policy logic, not the tenant.
2. **Controller lifecycle:** run a fresh supported Linux installation and upgrade
   an existing controller with a recoverable backup. Verify TLS, permissions on
   bind mounts, image selection, reboot recovery, and certificate renewal where
   used. This review built images but did not run the root installer on a VM.
3. **Probe acceptance:** deliver a generated configuration to real probes, run the
   daemon's validation, exercise SSID connection methods, metadata substitution,
   measurement execution, and scheduling collisions. Use the repository QA
   runbook and record the probe/daemon versions.
4. **Review and deployment:** the fixes are local working-tree changes. They have
   not been committed, pushed, tagged, or deployed to the controller.

## Known limits

- The server's development dependency tree still reports three high-severity
  entries in the `nodemon -> chokidar -> braces` chain. They are absent from the
  production image. The suggested forced npm fix is a major downgrade and was
  not applied; track a supported upstream fix separately.
- Host regex safety uses a heuristic, not a linear-time regex engine. Some
  adversarial expressions may still consume excessive CPU. Restrict alpha write
  access to trusted operators; do not treat this review as approval for hostile
  multi-tenant use.
- Simultaneous edits, backup consistency during active writes, long-running load,
  and a complete mobile/accessibility matrix have not been certified. Pause
  writes during a release backup/restore acceptance test.
- Vite reports a main-bundle size warning above 500 kB. This is a performance
  follow-up, not a build failure.

## Reproduction

```bash
npm test
npm --prefix services/server run typecheck
npm --prefix services/client run typecheck
npm --prefix services/server run build
npm --prefix services/client run build
npm --prefix services/server audit --omit=dev --audit-level=high
npm --prefix services/client audit --omit=dev --audit-level=high
bash scripts/tests/database-maintenance.test.sh
bash scripts/check-repo-consistency.sh
# Run only against a disposable writable test deployment:
bash scripts/smoke-test.sh http://127.0.0.1:18980
```
