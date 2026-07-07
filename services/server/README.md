# Backend Initialization
Docker runs `entrypoint.sh` to start the backend service, in which files under
`starters/` are copied to the correct destinations within the container. The folder
worth mentioning is `staters/tests/`, which contains test templates that used to
define the rules for each test.

For instance, `rtt` is a test option on the frontend tests page with three input
fields - `dest`, `length`, and `protocol`. Correspondingly, `starters/tests/rtt.json`
contains entries for the three input fields along with input validation code. The
following is the content of `rtt.json`.
```
{
    "name": "rtt",
    "parameters": [
        {
            "name":"dest",
            "type":"text",
            "default": "",
            "validator": "return input && !/\\s/.test(input);",
            "description": "dest should be nonempty and free of whitespace"
        },
        {
            "name":"length",
            "type":"number",
            "default": 512,
            "validator": "return input > 0;",
            "description": "length should be a positive integer"
        },
        {
            "name":"protocol",
            "type":"singleselect",
            "options": [
                {"name": "TCP"},
                {"name": "UDP"}
            ],
            "default": { "name": "TCP" },
            "validator": "return true;",
            "description": "protocol should be either TCP or UDP"
        }
    ],
    "validator": "console.log('Global validator'); return true;"
}
```
Note that `validator` can be any string representing a piece of validation code, and
it will be converted into actual JavaScript code and will be run against user input.
After initialization, Docker mounts the template files to
`/var/lib/pssid/plugins/tests/` on the hosting machine.

# Layer 2 / Layer 3 Connection Methods

Each SSID profile names a layer 2 connection method and a layer 3 connection
method, both required. They follow the same directory-driven paradigm as test
templates: the available options are the files on disk. A batch inherits the
methods from the SSID profiles it references, so the methods travel with the
network rather than the batch.

Per the agreed layout, the plugin directory has one parent (`plugins/`) with a
subdirectory per category: `tests/`, `scripts/`, `layer2/`, `layer3/`.

- The available files live in `starters/layer2/` and `starters/layer3/`. At
  startup `entrypoint.sh` copies them to `plugins/layer2/` and `plugins/layer3/`
  (mounted at `/var/lib/pssid/plugins/` on the host). The directories are read in
  via `layer2_path` / `layer3_path` in `paths_config.json`.
- The backend lists the available names at
  `GET /api/layer-scripts/layer2-files` and `GET /api/layer-scripts/layer3-files`.
  The SSID profile page renders each list as a dropdown. When a directory holds
  exactly one file it is auto-selected; multiple files produce a real choice; an
  empty directory yields no options and profiles cannot be saved.

To add a new option, drop a JSON file into the matching `starters/<category>/`
directory, no code change is required.

## SSID profile config fields

| Field           | Type   | Required | Notes                                                |
| --------------- | ------ | -------- | ---------------------------------------------------- |
| `SSID`          | string | yes      | The wireless network name the profile connects to.   |
| `layer2_script` | string | yes      | Name (no extension) of a file in `plugins/layer2/`.  |
| `layer3_script` | string | yes      | Name (no extension) of a file in `plugins/layer3/`.  |

These fields are written into the ssid_profile document and are emitted unchanged
into the generated `pssid_config.json` (the whole `ssid_profiles` collection is
serialized), so the daemon reads the connection methods from each SSID profile.
Multiple profiles may share the same `SSID` (for example two profiles both
pointing at `Campus-WiFi`) while differing in their methods.

## Security model for selectable scripts

Because a selected name is written into the config that is deployed to and acted
on by the probes, the value is constrained at every step:

1. **Write-time validation** (`ssid_profiles.controllers.ts`): on create/update,
   `layer2_script` and `layer3_script` are required and must match an actual file
   in the corresponding directory, otherwise the request is rejected (`400`).
   If the directory is unreadable, a conservative character allow-list
   (`^[A-Za-z0-9._-]+$`) is enforced instead, which blocks path separators and
   traversal sequences.
2. **Render-time re-validation** (`config.service.ts`): immediately before the
   config file is generated, each SSID profile's stored value is checked again
   against the scripts currently on disk. A stale value (script later deleted) or a value
   injected directly into MongoDB is reset to `""` rather than emitted.
3. **Authorization** (`*.routes.ts` + `shared/accessControl.ts`): listing scripts
   requires `read`; changing a batch (and therefore its script selection)
   requires `write`. These are enforced server-side, not just hidden in the UI.

### Deployment responsibilities (outside this repo)

These cannot be enforced by the web app alone and must be handled by operators
and the daemon:

- The `plugins/layer2/` and `plugins/layer3/` directories on the host must be
  writable only by trusted administrators. Any file placed there becomes a
  selectable, deployable script, so directory provenance is part of the trust
  boundary.
- The pSSID daemon that consumes `pssid_config.json` must invoke the named
  constructor/destructor scripts using an argument vector (no shell string
  interpolation) and should apply its own allow-list. The GUI guarantees the
  name corresponds to a real file at config-generation time, but execution
  safety is the daemon's responsibility.
