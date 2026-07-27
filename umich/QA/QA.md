# QA walkthrough and demonstration

How to load the QA dataset on top of the pre-load, run an official demo that
shows every part of the GUI working, and verify the generated configuration is
correct, all without needing a probe.

This dataset is site-specific — the campus SSIDs and the two lab probes — so it
lives under [`umich/`](../README.md) with the rest of the University of Michigan
material, and deliberately **outside the deployment path**: neither the bootstrap
nor the installer runs `seed-qa.sh`. It is a manual QA tool, applied by hand on a
running stack. Run the commands below from the deployment directory (the
repository root), not from this folder.

The two seeders are **additive**: the pre-load
([`scripts/seed-defaults.sh`](../../scripts/seed-defaults.sh)) establishes the
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

Writes must be enabled or every GUI edit is refused and the forms stay grayed
out. With SSO off that means `OPEN_WRITE=true`:

```bash
cd /opt/pssid-gui && curl -sk https://localhost/api/userinfo; echo
```

Expect `"open_write":true`. If it is false, see
[../../docs/deployment.md](../../docs/deployment.md#single-sign-on).

Take a restore point first. This is what section 7 rolls back to:

```bash
make backup && ls -lt mongo-backups | head -3
```

## 1. Load the data

Order matters: the QA seeder reuses the pre-load's schedules and eduroam by
name, and refuses to run if they are missing.

```bash
bash scripts/seed-defaults.sh    # or: make seed-defaults
bash umich/QA/seed-qa.sh         # or: make seed-qa
```

On a first install the Ansible role has already run the pre-load, so only the
second command is needed.

**Probe names.** The two probes are identified by hostname, which at this site is
each probe's **IP address**. The seeder defaults to the two lab probes,
`198.111.226.186` and `198.111.226.189`, so the command above needs no arguments.

A name must match exactly what that probe reports as its hostname, or the daemon
exits on it. To point the dataset at a different pair, override the defaults:

```bash
PSSID_QA_PROBE1=<probe-1-ip> PSSID_QA_PROBE2=<probe-2-ip> bash umich/QA/seed-qa.sh
```

The two external destinations are overridable the same way
(`PSSID_QA_DEST1` / `PSSID_QA_DEST2`).

Expected final counts: schedules 4, ssid_profiles 2, tests 7, jobs 6,
batches 4, hosts 2, host_groups 2.

## 2. What each seeder owns

| | Pre-load | QA |
|---|---|---|
| Schedules | all 4 | none (reuses them) |
| SSID profiles | eduroam | MWireless |
| Tests | 2 Google tests | 5 more |
| Jobs | job-comprehensive | 5 more |
| Batches | none | all 4 |
| Hosts | none | 2 probes |
| Host groups | `all` (regex `.*`) | `rpi4` |

The QA seeder attaches `batch-comprehensive` to the pre-load's `all` group and
leaves everything else about that group alone. Re-running either seeder, in
either order, lands in the same state: the pre-load upserts its own documents
(preserving their database ids) and never touches batches, hosts or `rpi4`.

**Host regex.** `all` uses `.*`, a standard Python `re.match` pattern: `.` is
any character, `*` a quantifier, so `.*` matches everything (a bare `*` is
invalid). The GUI's regex field links to the
[`re` syntax guide](https://docs.python.org/3/library/re.html); see also
[../../docs/deployment.md](../../docs/deployment.md#host-groups-regex-and-metadata).

## 3. Official demonstration (GUI, section by section)

A presenter's script: open each page in turn, point out that the seeded data is
there and editable, and finish at Settings where the whole thing becomes a
config file. Every screen is one or two clicks. The probe names below are the two
lab probes the seeder defaults to; substitute your own if you overrode them.

**Schedules.** Show the four cron schedules.
- Point out `Every 5 minutes` and `Every 1 hour` (the two the batches collide on).
- Open one, change nothing, and note the cron string renders. Cancel.

**SSID profiles.** Show `eduroam` and `MWireless`.
- Open `MWireless`; show it has both a layer 2 and a layer 3 method.
- (Optional, restored by re-seeding:) clear the layer 2 method and note Preview
  rejects it.

**Tests.** Show the seven tests and that different types have different fields.
- Open `test-rtt-to-external`: type **rtt**, `dest` is `$external_dest`, `length`
  is a number, `protocol` is a dropdown set to `UDP`.
- Open `test-dns-to-external`: type **dns**, a `record` dropdown (`AAAA`), and a
  free-form `comment` field. This is the one that exercises every field kind.
- Point out `$external_dest`: a metadata reference resolved per host, not a
  literal URL.

**Jobs.** Show the six jobs bundling tests.
- Open `job-comprehensive-2`: it runs two tests, `parallel` is `False`,
  `continue-if` is `false`, different from the others, to show the options.
- Point out the help text under **Tests**: the tests inside a job are **not
  guaranteed to run in any particular order**. If one thing has to happen before
  another, they belong in separate jobs — a batch runs *its jobs* in the listed
  order.

**Batches.** The central part of the demonstration: four batches at three priorities.
- Show `batch-comprehensive` (priority **0**, eduroam, two jobs),
  `batch-host` (**1**, MWireless), `batch-group` (**2**, MWireless) and
  `batch-tie` (**2**, MWireless).
- Point out the priority help text: *lower number has higher precedence in the
  event of a scheduling conflict*.
- `batch-group` and `batch-tie` carry the **same** priority on purpose — the
  ambiguous case, covered in section 5.
- All four list the same two schedules, the deliberate collision for section 5.

**Hosts.** Show the two probes.
- Open `198.111.226.186`; show its metadata `external_dest = <its value>`
  (e.g. `www.google.com`), and that `198.111.226.189` has the **same key, a
  different value** (`www.reddit.com`). This is what the host's `data` block
  holds, and it is the only metadata field the daemon reads.
- Point out `198.111.226.186`'s **Batches** field already lists
  `batch-host`, attached directly rather than through a group;
  `198.111.226.189` has none of its own. Why that matters: section 5.
- Optional: to also exercise the GUI's own write path for a host-batch
  assignment (as opposed to the seeder writing to MongoDB directly), remove
  `batch-host` from `198.111.226.186`, Save, reload to confirm it is gone,
  then reattach it and Save again. Re-running `bash umich/QA/seed-qa.sh` restores it
  regardless.
- Open the host's **Probe configuration** panel: it shows only this host's slice
  of the config.

**Host groups.** Show `all` and `rpi4`, the two ways to select hosts.
- `all`: **by regex**. Open it; the regex field shows `.*` and the help text
  links to the Python `re` guide. This is how `batch-comprehensive` reaches every
  probe.
- `rpi4`: **by selection**. Its hosts were added with **Select all** (by name,
  not a pattern). It supplies the group metadata `ifacename=wlan0` and carries
  both `batch-group` and `batch-tie`.
- Point out that the two membership styles are equivalent in what they deliver:
  a host gets the group's **batches and its metadata** whether it was listed by
  name or matched by the pattern. What separates a group key from a host key is
  precedence, not membership style — the host's own key wins.

**Settings → Configuration.** Turn all of the above into the daemon's files.
- **Preview**: builds and validates without writing. Walk through the output
  using section 4 below.
- **Generate**: writes `pssid_config.json` and `hosts.ini` to the controller.

That is the full loop: define objects on each page → combine them into batches →
attach to hosts and groups → generate a validated config file.

## 4. Verify the generated config

**Settings → Configuration → Preview**, then check each of the following. All of
it is verified against the shipped pipeline, so these are exact expectations.
(Values assume the default probe names and destinations.)

**Batch attachment.** `198.111.226.186`'s `batches` lists all four;
`198.111.226.189`'s lists `batch-comprehensive`, `batch-group` and
`batch-tie` (all arriving via `all`/`rpi4`). `batch-host` reaches probe 1 alone,
by direct host attachment rather than a group. See section 5 for why.

**`data` vs `metadata`.** Both appear per host, and they are not the same thing:

- `data` is what was typed into the Metadata section of the host (or the group).
  **It is the only field the daemon reads.**
- `metadata` is the resolved answer the GUI computed from those `data` blocks —
  a convenience for the reader. The daemon ignores it and re-derives the same
  values itself.

So each probe carries its own `data` and the merged `metadata`:

```json
"198.111.226.186": { "data": { "external_dest": "www.google.com" },
                        "metadata": { "external_dest": "www.google.com", "ifacename": "wlan0" } }
"198.111.226.189": { "data": { "external_dest": "www.reddit.com" },
                        "metadata": { "external_dest": "www.reddit.com", "ifacename": "wlan0" } }
```

`ifacename` comes from the `rpi4` group's `data`, `external_dest` from each
host's own. Same key, different value per probe, which is the point of this part
of the dataset. A host key would win over a group key of the same name; nothing
in this dataset collides, so both survive.

**Metadata references stay literal.** `"url": "$external_dest"` and
`"test_interface": "$ifacename"` are **not** substituted in this file; the daemon
resolves them per host at run time, from `data`. Seeing `$external_dest` is
correct.

The key uses an **underscore**, not a hyphen. Metadata references use identifier
syntax (like the existing `$ifacename`), and `$`-substitution stops at a hyphen,
so `$external-dest` would resolve as `$external` followed by a literal `-dest`.
`$external_dest` is the correct form.

**Test specs are flat objects**, converted from the GUI's form-field arrays.
`test-dns-to-external` is the one to check, since it covers three field kinds at
once: text, singleselect, and a user-defined optional key/value:

```json
{ "name": "test-dns-to-external", "type": "dns",
  "spec": { "nameserver": "$external_dest", "record": "AAAA", "comment": "qa-optional-field" } }
```

If you see `"type"`/`"name"` keys inside `spec`, the conversion did not run.

**No `_ids` fields anywhere.** `batch_ids`, `test_ids` and friends are database
bookkeeping and are stripped before the daemon sees the file.

**`hosts.ini`.** Every host first, then one section per group:

```ini
198.111.226.186
198.111.226.189

[all]
#Regex [all] [.*]

[rpi4]
198.111.226.186
198.111.226.189
```

`all` renders as a `#Regex` **comment** with no members, because Ansible cannot expand
patterns, so the daemon does the matching. `rpi4` lists its members because they
were selected by name.

**Then Generate**, and confirm the files were actually written:

```bash
docker compose exec -T server ls -l output/
```

Both files must carry **today's** timestamp. Clear them first
(`rm -f /var/lib/pssid/output/*`) if you want an unambiguous result.

## 5. Check priority

**Lower number has higher precedence in the event of a scheduling conflict**:
`batch-comprehensive` (0) → `batch-host` (1) → `batch-group` and `batch-tie`
(both 2).

All four share **both** the "Every 1 hour" and "Every 5 minutes" schedules, so
they are due simultaneously every five minutes and again on the hour. That
collision is deliberate: it is what makes precedence observable.

`batch-host` reaches only `198.111.226.186` (attached directly, not through
a group), so that probe is the one all four batches reach. On it, the
higher-precedence batch should run and the others yield. `198.111.226.189`
sees `batch-comprehensive` (0), `batch-group` (2) and `batch-tie` (2), so the
full three-level ordering is only visible on probe 1.

Without a probe, confirm in Preview that `198.111.226.186` resolves to all
four batches, `198.111.226.189` to three, and that the shared batches
genuinely overlap on both schedules.

### Identical precedence

`batch-group` and `batch-tie` are **both priority 2**, both on the `rpi4` group,
and both on the same two schedules. Every five minutes, and again on the hour,
every probe in `rpi4` has two batches due at the same instant with nothing to
choose between them.

This is the case worth recognising, because it is the one the configuration does
**not** answer. Priority orders batches only when the numbers differ; at equal
numbers the daemon hands both to the scheduler with the same key and their
relative order falls out of its internal ordering. Treat it as unspecified: it is
not a promise, and it may differ between runs, releases, or probes.

What to check:

- Preview shows `batch-group` and `batch-tie` on both probes, both at priority 2,
  both listing the same two schedules. The GUI reports the tie faithfully rather
  than silently reordering or rejecting it — equal priorities are legal.
- Their jobs are distinct (`job-group-1` runs rtt, `job-tie-1` runs http to a
  fixed target), so on a real probe the two are easy to tell apart in the logs.
- Whatever order a probe happens to run them in, do not record it as expected
  behaviour.

The remedy, whenever the order between two batches actually matters, is to give
them different priorities — which is exactly what separates 0, 1 and 2 in the
rest of this dataset.

## 6. Error handling

Confirm a broken reference is reported rather than silently shipped. Delete
`job-group-1` while `batch-group` still uses it, then Preview:

```
batch "batch-group": references unknown job "job-group-1"
```

Re-run `bash umich/QA/seed-qa.sh` to restore.

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

Re-running `seed-defaults.sh` alone does **not** undo the QA data; it owns only
its own documents, by design. Restoring from a backup is the way back.

## Reference: what the dataset exercises

| Path | How |
|---|---|
| Batch via group **regex** | `all` (`.*`) carries `batch-comprehensive` |
| Batch via group **selection** | `rpi4` (members by name) carries `batch-group` and `batch-tie` |
| Batch via **host**, attached directly | `batch-host`, on `198.111.226.186` only (optionally re-exercised by hand in section 3) |
| Group metadata | `ifacename=wlan0` on `rpi4` → `$ifacename` |
| Host metadata, same key, different values | `external_dest` per probe → `$external_dest` |
| Metadata layering | host `data` over group `data`, resolved per host into `metadata` |
| Priority collision | four batches, shared schedules, priorities 0/1/2/2 |
| **Identical** precedence | `batch-group` and `batch-tie`, both priority 2, both due together |
| Test field types | text, number, singleselect, optional key/value |
| Test types | http, rtt, dns, trace |
| Job variants | parallel True/False, continue-if true/false, differing backoff |
| Multi-job batch | `batch-comprehensive` runs two jobs |
| Two SSIDs | eduroam (comprehensive), MWireless (host + group) |
