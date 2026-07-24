# QA walkthrough

How to load the QA dataset on top of the pre-load, what it wires up, and how to
check the generated configuration is correct — without needing a probe.

The two seeders are **additive**: the pre-load
([`scripts/seed-defaults.sh`](../scripts/seed-defaults.sh)) establishes the
baseline, and the QA seeder ([`scripts/seed-qa.sh`](../scripts/seed-qa.sh)) adds
to it without deleting, resetting or rewriting anything the pre-load owns.

## Contents

- [Before you start](#before-you-start)
- [1. Load the data](#1-load-the-data)
- [2. What each seeder owns](#2-what-each-seeder-owns)
- [3. The manual GUI step](#3-the-manual-gui-step)
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
[deployment.md](deployment.md#single-sign-on).

Take a restore point first — this is what section 7 rolls back to:

```bash
make backup && ls -lt mongo-backups | head -3
```

## 1. Load the data

Order matters: the QA seeder reuses the pre-load's schedules and eduroam by
name, and refuses to run if they are missing.

```bash
bash scripts/seed-defaults.sh     # or: make seed-defaults
bash scripts/seed-qa.sh           # or: make seed-qa
```

On a first install the Ansible role has already run the pre-load, so only the
second command is needed.

To point the dataset at real probes, override the names — they must match the
probes' real hostnames exactly, or the daemon exits on them:

```bash
PSSID_QA_PROBE1=lab-pi-01 PSSID_QA_PROBE2=lab-pi-02 \
PSSID_QA_PROBE3=lab-pi-03 PSSID_QA_PROBE4=lab-pi-04 \
bash scripts/seed-qa.sh
```

The four external destinations are overridable the same way
(`PSSID_QA_DEST1`…`4`).

Expected final counts: schedules 4, ssid_profiles 2, tests 7, jobs 5,
batches 3, hosts 4, host_groups 2.

## 2. What each seeder owns

| | Pre-load | QA |
|---|---|---|
| Schedules | all 4 | — (reuses them) |
| SSID profiles | eduroam | MWireless |
| Tests | 2 Google tests | 5 more |
| Jobs | job-comprehensive | 4 more |
| Batches | — | all 3 |
| Hosts | — | 4 probes |
| Host groups | `all` (regex `.*`) | `rpi4` |

The QA seeder attaches `batch-comprehensive` to the pre-load's `all` group with
`$addToSet` rather than recreating the group, so the regex and anything else
attached to it survive. Re-running the pre-load afterwards is safe: it upserts
`all` and never touches batches, hosts or `rpi4`.

**Host regex.** `all` uses `.*`, which is a **standard regular expression**
matched with Python's `re.match` — `.` is any character, `*` is a quantifier. A
bare `*` is invalid and matches nothing. See
[deployment.md](deployment.md#host-groups-regex-and-metadata).

## 3. The manual GUI step

`batch-host` is deliberately left attached to **no host**. Assigning it is a QA
step, and the only part of this walkthrough that exercises the GUI's own
host/batch assignment path — the seeders write to MongoDB directly and bypass
it entirely.

1. **Hosts** → open the first probe
2. Attach **batch-host** to it
3. Save, reload the page, confirm it persisted

## 4. Verify the generated config

**Settings → Configuration → Preview**, then check each of the following. All
of it is verified against the shipped pipeline, so these are exact expectations,
not approximations.

**Metadata layering** — group metadata sits *under* host metadata, and every
probe carries its own destination:

```json
"rpi4-probe-01": { "ifacename": "wlan0", "external_dest": "www.google.com" }
"rpi4-probe-02": { "ifacename": "wlan0", "external_dest": "www.reddit.com" }
"rpi4-probe-03": { "ifacename": "wlan0", "external_dest": "www.wikipedia.org" }
"rpi4-probe-04": { "ifacename": "wlan0", "external_dest": "www.example.edu" }
```

`ifacename` comes from the `rpi4` group, `external_dest` from each host. Same
key, different value per probe — that is the point of this part of the dataset.

**Metadata references stay literal.** `"url": "$external_dest"` and
`"test_interface": "$ifacename"` are **not** substituted in this file; the daemon
resolves them per host at run time. Seeing `$external_dest` is correct.

The key uses an underscore. `$`-substitution stops at a hyphen, so
`$external-dest` would resolve as `$external` followed by a literal `-dest`.

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
rpi4-probe-01
rpi4-probe-02
rpi4-probe-03
rpi4-probe-04

[all]
#Regex [all] [.*]

[rpi4]
rpi4-probe-01
rpi4-probe-02
rpi4-probe-03
rpi4-probe-04
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

Re-run `bash scripts/seed-qa.sh` to restore.

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
