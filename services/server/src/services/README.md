# Backend services

### config.service.ts
Produces the config file and the Ansible inventory, and runs the provision script.
All generated outputs originate here.

### database.service.ts
Connects to the MongoDB client instance.

### identity.service.ts
Resolves the acting identity from the OIDC claims, once, for everything that has
to name a person: the audit line, the `pssid_metadata` provenance block in a
generated config, and the argument vector handed to the provision script. Those
three used to derive it independently from `req.oidc.user`, so a change to one
silently disagreed with the others about who did something. Every field falls
back rather than going empty, because a deployment picks its own `SSO_SCOPE` and
may release no human-readable claim at all.

### delete.service.ts
Maintains data validity when an object is deleted. For example, when a host is
deleted, it ensures the same host is removed from every host_group that references it,
preventing later inconsistencies.

### update.service.ts
Maintains data validity by updating dependent collections when a referenced
collection's data changes.

### utility.service.ts
Provides functions that resolve object IDs from the database, supporting the reference
system that keeps related objects in sync. When an object is referenced from another
collection (for example, when hosts are selected within a host_group), its object
`_id` is stored alongside the reference. Referencing by `_id` rather than by name keeps
references stable when a name changes or an object must be removed from several places.
