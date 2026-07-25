# QA walkthrough and demonstration

How to load the QA dataset on top of the pre-load, run an official demo that
shows every part of the GUI working, and verify the generated configuration is
correct — all without needing a probe.

This folder is deliberately **outside the deployment path**: neither the
bootstrap nor the installer runs `seed-qa.sh`. It is a manual QA tool, applied
by hand on a running stack.

The two seeders are **additive**: the pre-load
([`scripts/seed-defaults.sh`](../scripts/seed-defaults.sh)) establishes the
baseline, and the QA seeder ([`seed-qa.sh`](seed-qa.sh)) adds to it without
deleting, resetting or rewriting anything the pre-load owns.

## Contents

- [Before you start](#before-you-start)
- [1. Load the data](#1-load-the-data)
- [2. What each seeder owns](#2-what-each-seeder-owns)
- [3. Official demonstration (GUI, section by section)](#3-official-demonstration-gui-section-by-section)
- [4. Verify the generated config](#4-verify-the-generated-config)
- [5. Check priority](#5-check-priority)
- [6. Error handling](#6-error-handling)
- [7. Return to the baseline](#7-return-to-the-baseline)
- [Reference: what the dataset exercises](#reference-what-the-dataset-exercises)

## Before you start

Both seeders `docker exec` into the running mongo container, so run them **on the
VM**, from the deployment directory (usually `/opt/pssid-gui`), with the stack up.

Writes must be enabled or every GUI edit is refused and the forms stay greyed
out. With SSO off that means `OPEN_WRITE=true`:

```bash
cd /opt/pssid-gui && curl -sk https://localhost/api/userinfo; echo
```

Expect `"open_write":true`. If it is false, see
[../docs/deployment.md](../docs/deployment.md#single-sign-on).

Take a restore point first — this is what section 7 rolls back to:

```bash
make backup && ls -lt mongo-backups | head -3
```

## 1. Load the data

Order matters: the QA seeder reuses the pre-load's schedules and eduroam by
name, and refuses to run if they are missing.

```bash
bash scripts/seed-defaults.sh     # or: make seed-defaults
bash QA/seed-qa.sh                # or: make seed-qa
```

On a first install the Ansible role has already run the pre-load, so only the
second command is needed.

**Probe names.** The two probes are identified by hostname, which at this site is
each probe's **IP address**. Ask the QA operator for the two IPs and pass them
in; they must match what each probe reports as its hostname, or the daemon exits
on it. Until you have them, the script uses the placeholders
`Probe-IP-address-1` / `Probe-IP-address-2`.

```bash
PSSID_QA_PROBE1=10.0.0.11 PSSID_QA_PROBE2=10.0.0.12 bash QA/seed-qa.sh
```

The two external destinations are overridable the same way
(`PSSID_QA_DEST1` / `PSSID_QA_DEST2`).

Expected final counts: schedules 4, ssid_profiles 2, tests 7, jobs 5,
batches 3, hosts 2, host_groups 2.

## 2. What each seeder owns

| | Pre-load | QA |
|---|---|---|
| Schedules | all 4 | — (reuses them) |
| SSID profiles | eduroam | MWireless |
| Tests | 2 Google tests | 5 more |
| Jobs | job-comprehensive | 4 more |
| Batches | — | all 3 |
| Hosts | — | 2 probes |
| Host groups | `all` (regex `.*`) | `rpi4` |

The QA seeder attaches `batch-comprehensive` to the pre-load's `all` group and
leaves everything else about that group alone. Re-running either seeder, in
either order, lands in the same state: the pre-load upserts its own documents
(preserving their database ids) and never touches batches, hosts or `rpi4`.

**Host regex.** `all` uses `.*`, a standard Python `re.match` pattern — `.` is
any character, `*` a quantifier, so `.*` matches everything (a bare `*` is
invalid). The GUI's regex field links to the
[`re` syntax guide](https://docs.python.org/3/library/re.html); see also
[../docs/deployment.md](../docs/deployment.md#host-groups-regex-and-metadata).

## 3. Official demonstration (GUI, section by section)

A presenter's script: open each page in turn, point out that the seeded data is
there and editable, and finish at Settings where the whole thing becomes a
config file. Every screen is one or two clicks. Placeholder probe names are used
below; substitute the real IPs if you seeded with them.

**Schedules** — show the four cron schedules.
- Point out `Every 5 minutes` and `Every 1 hour` (the two the batches collide on).
- Open one, change nothing, and note the cron string renders. Cancel.

**SSID profiles** — show `eduroam` and `MWireless`.
- Open `MWireless`; show it has both a layer 2 and a layer 3 method.
- (Optional break, restored later:) clear the layer 2 method and note Preview
  will later reject it.

**Tests** — show the seven tests and that different types have different fields.
- Open `test-rtt-to-external`: type **rtt**, `dest` is `$external_dest`, `length`
  is a number, `protocol` is a dropdown set to `UDP`.
- Open `test-dns-to-external`: type **dns**, a `record` dropdown (`AAAA`), and a
  free-form `comment` field — this is the one that exercises every field kind.
- Point out `$external_dest`: a metadata reference resolved per host, not a
  literal URL.

**Jobs** — show the five jobs bundling tests.
- Open `job-comprehensive-2`: it runs two tests, `parallel` is `False`,
  `continue-if` is `false` — different from the others, to show the options.

**Batches** — the heart of the demo: three batches at three priorities.
- Show `batch-comprehensive` (priority **0**, eduroam, two jobs),
  `batch-host` (**1**, MWireless), `batch-group` (**2**, MWireless).
- Point out the priority help text: *lower number = higher priority*.
- All three list the same two schedules — the deliberate collision for section 5.

**Hosts** — show the two probes.
- Open `Probe-IP-address-1`; show its metadata `external_dest = <its value>`
  (e.g. `www.google.com`), and that `Probe-IP-address-2` has the **same key, a
  different value** (`www.reddit.com`).
- **Assign a batch through the GUI** (the one step the seeder leaves for you):
  attach **batch-host** to `Probe-IP-address-1`, Save, reload — it persists.
  This is what proves the GUI's own write path, not just the seeder's.
- Open the host's **Probe configuration** panel: it shows only this host's slice
  of the config.

**Host groups** — show `all` and `rpi4`, the two ways to select hosts.
- `all`: **by regex**. Open it; the regex field shows `.*` and the help text
  links to the Python `re` guide. This is how `batch-comprehensive` reaches every
  probe.
- `rpi4`: **by selection**. Its hosts were added with **Select all** (by name,
  not a pattern) — which is what delivers the group metadata `ifacename=wlan0`
  to them. It carries `batch-group`.
- Point out the contrast: a host matched only by regex still gets the group's
  *batches*, but group *metadata* reaches only hosts listed by name.

**Settings → Configuration** — turn all of the above into the daemon's files.
- **Preview**: builds and validates without writing. Walk through the output
  using section 4 below.
- **Generate**: writes `pssid_config.json` and `hosts.ini` to the controller.

That is the full loop: define objects on each page → combine them into batches →
attach to hosts and groups → generate a validated config file.

## 4. Verify the generated config

**Settings → Configuration → Preview**, then check each of the following. All of
it is verified against the shipped pipeline, so these are exact expectations.
(Values assume the placeholder probe names and default destinations.)

**Metadata layering** — group metadata sits *under* host metadata, and each probe
carries its own destination:

```json
"Probe-IP-address-1": { "ifacename": "wlan0", "external_dest": "www.google.com" }
"Probe-IP-address-2": { "ifacename": "wlan0", "external_dest": "www.reddit.com" }
```

`ifacename` comes from the `rpi4` group, `external_dest` from each host. Same
key, different value per probe — the point of this part of the dataset.

**Metadata references stay literal.** `"url": "$external_dest"` and
`"test_interface": "$ifacename"` are **not** substituted in this file; the daemon
resolves them per host at run time. Seeing `$external_dest` is correct.

The key uses an **underscore**, not a hyphen. Metadata references use identifier
syntax (like the existing `$ifacename`), and `$`-substitution stops at a hyphen —
so `$external-dest` would resolve as `$external` followed by a literal `-dest`.
`$external_dest` is the correct form.

**Test specs are flat objects**, converted from the GUI's form-field arrays.
`test-dns-to-external` is the one to check, since it covers three field kinds at
once — text, singleselect, and a user-defined optional key/value:

```json
{ "name": "test-dns-to-external", "type": "dns",
  "spec": { "nameserver": "$external_dest", "record": "AAAA", "comment": "qa-optional-field" } }
```

If you see `"type"`/`"name"` keys inside `spec`, the conversion did not run.

**No `_ids` fields anywhere.** `batch_ids`, `test_ids` and friends are database
bookkeeping and are stripped before the daemon sees the file.

**`hosts.ini`** — every host first, then one section per group:

```ini
Probe-IP-address-1
Probe-IP-address-2

[all]
#Regex [all] [.*]

[rpi4]
Probe-IP-address-1
Probe-IP-address-2
```

`all` renders as a `#Regex` **comment** with no members — Ansible cannot expand
patterns, so the daemon does the matching. `rpi4` lists its members because they
were selected by name.

**Then Generate**, and confirm the files were actually written:

```bash
docker compose exec -T server ls -l output/
```

Both files must carry **today's** timestamp. Clear them first
(`rm -f /var/lib/pssid/output/*`) if you want an unambiguous result.

## 5. Check priority

Lower number wins: `batch-comprehensive` (0) → `batch-host` (1) →
`batch-group` (2).

All three share **both** the "Every 1 hour" and "Every 5 minutes" schedules, so
they are due simultaneously every five minutes and again on the hour. That
collision is deliberate — it is what makes priority observable. On a probe, the
higher-priority batch should run and the others yield.

Without a probe, confirm in Preview that the three batches carry priorities
0/1/2 and genuinely overlap on both schedules.

## 6. Error handling

Confirm a broken reference is reported rather than silently shipped. Delete
`job-group-1` while `batch-group` still uses it, then Preview:

```
batch "batch-group": references unknown job "job-group-1"
```

Re-run `bash QA/seed-qa.sh` to restore.

Other messages worth provoking the same way:

| Break | Message |
|---|---|
| Empty a batch's SSID list | `batch "X": ssid_profiles must be a non-empty list` |
| Clear a layer 2 method | `ssid_profile "X": layer2_script (layer 2 method) is required` |
| Delete a host still in a group | `host_group "X": references unknown host "Y"` |
| Deselect a dropdown | `test "X" field "Y" has no value selected` |

## 7. Return to the baseline

```bash
make restore          # choose the archive from "Before you start"
```

Then confirm the QA objects are gone:

```bash
docker compose exec -T mongo mongosh --quiet \
  -u "$(sed -n 's/^MONGO_USERNAME=//p' .env)" \
  -p "$(sed -n 's/^MONGO_PASSWORD=//p' .env)" \
  --authenticationDatabase admin gui \
  --eval 'print("hosts:",db.hosts.countDocuments(),"batches:",db.batches.countDocuments())'
```

Expect `hosts: 0 batches: 0`.

Re-running `seed-defaults.sh` alone does **not** undo the QA data — it owns only
its own documents, by design. Restoring from a backup is the way back.

## Reference: what the dataset exercises

| Path | How |
|---|---|
| Batch via group **regex** | `all` (`.*`) carries `batch-comprehensive` |
| Batch via group **selection** | `rpi4` (members by name) carries `batch-group` |
| Batch via **host**, set in the GUI | `batch-host`, assigned by hand in section 3 |
| Group metadata | `ifacename=wlan0` on `rpi4` → `$ifacename` |
| Host metadata, same key, different values | `external_dest` per probe → `$external_dest` |
| Metadata layering | group under host, per host |
| Priority collision | three batches, shared schedules, priorities 0/1/2 |
| Test field types | text, number, singleselect, optional key/value |
| Test types | http, rtt, dns, trace |
| Job variants | parallel True/False, continue-if true/false, differing backoff |
| Multi-job batch | `batch-comprehensive` runs two jobs |
| Two SSIDs | eduroam (comprehensive), MWireless (host + group) |
