# About each service file

### config.service.ts
Responsible for producing the config file, ansible inventory, and running the shellscript.sh file. All outputs originate from here.

### update.service.ts
Maintains data validity by updating outdated collections when a referenced collection's data changes. 

Could improve code here by templating further :)

### utility.service.ts
Contains functions that get object ids from database. Helps set up reference system to potentially update objects in the future. 

When an object is referenced in another collection, like when hosts are selected in the host_groups collection, their object _ids are also placed in the collection to maintain data validity. We cannot strictly reference by name in case a name changes or we need to delete objects in multiple places! (Although I found a work around for this on the frontend side of things by keeping track of an old name and a new name if it changes)

