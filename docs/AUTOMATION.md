# Automation — GUI → Daemon Sync

This document explains how configuration created in the GUI reaches the pSSID
daemon on your probes, and how to make that propagation automatic.

---

## The provisioning pipeline

Everything you create in the GUI (hosts, host groups, schedules, SSID profiles,
tests, jobs, batches) is stored in MongoDB. Provisioning turns that state into
files the probes consume and pushes them out:

1. **Generate inventory** — `hosts.ini` (Ansible inventory of hosts/groups).
2. **Generate daemon config** — `pssid_config.json` (all collections merged;
   test specs normalized; batch script selections re-validated against the
   scripts actually on disk).
3. **Run the provision script** — the server calls `bin/provision`, which uses
   Ansible to copy the config to the probes in `hosts.ini` and restart the pSSID
   daemon.

This is implemented in
[`create_config_file()`](../services/server/src/services/config.service.ts) and
recorded in the **provision history** (visible in the GUI under *History*).

---

## Two ways to provision

### Manual (default)

Click **Configure selected host** / **Configure selected group** on the Hosts or
Groups page, or **Provision now** on the Settings page. Provisioning runs once,
immediately.

### Automatic (opt-in)

Turn on **Auto-provision on change** in **Settings**. After that, any successful
edit to a daemon-affecting collection (hosts, host groups, schedules, SSID
profiles, tests, jobs, batches) automatically regenerates the config and pushes
it to the probes — no manual click needed.

---

## Safety model

Auto-provision is designed to be convenient **without** sacrificing safety:

- **Off by default.** It only runs after an operator explicitly enables it.
- **Debounced.** Rapid successive edits collapse into a single provision run
  (a ~5-second quiet window), so a burst of changes won't trigger a storm of
  Ansible runs. A run already in flight defers the next one rather than
  overlapping.
- **Audited.** Every run — manual or automatic — is recorded in provision
  history with a `trigger` of `manual` or `auto`, the caller, the target, and
  success/failure. The History page shows the Trigger column.
- **Re-validated.** Auto runs go through the exact same path as manual ones,
  including the on-disk re-validation of batch layer-2/layer-3/script selections
  (`sanitizeBatchScripts`), so stale or injected values never reach the probes.
- **Permission-gated.** Toggling the setting requires write access (SSO group
  with `write`, or `OPEN_WRITE=true` when SSO is off). Read-only users see the
  toggle disabled.

### Implementation

- Setting stored in the Mongo `settings` collection (`autoProvision`), exposed at
  `GET/PUT /api/settings`.
- [`autoProvisionOnWrite`](../services/server/src/services/autoProvision.service.ts)
  middleware is mounted ahead of the daemon-affecting routers; on a successful
  write (`2xx`/`3xx` response to POST/PUT/PATCH/DELETE) it requests a debounced
  provision. The explicit `/config` provisioning endpoints are skipped to avoid
  double-firing.

---

## Seamless development

For working on the codebase itself, the dev stack hot-reloads both client and
server:

```bash
make dev      # http://localhost:8888, edits in services/*/src reload live
```

Source directories are bind-mounted into the containers, so changes are picked up
without rebuilding images.

---

## Operational guidance

- Enable auto-provision once your batch/test definitions are stable and you want
  edits to take effect without extra clicks.
- Keep it **off** during bulk reorganizations if you'd rather provision once at
  the end (or just rely on the debounce and provision the final state).
- Use the **History** page to confirm what was pushed, when, by whom, and whether
  it succeeded.
