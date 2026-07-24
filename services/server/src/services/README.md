# Backend services

### config.service.ts
Produces the config file and the Ansible inventory, and runs the provision script.
All generated outputs originate here.

### database.service.ts
Connects to the MongoDB client instance.

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
collection — for example, when hosts are selected within a host_group — its object
`_id` is stored alongside the reference. Referencing by `_id` rather than by name keeps
references stable when a name changes or an object must be removed from several places.
