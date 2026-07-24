# Backend overview

The final configuration-file format is documented in the pSSID daemon repository:
[pSSID_config.json](https://github.com/UMNET-perfSONAR/pSSID2/blob/main/pSSID_config.json).

Each component of the config file has its own:
* MongoDB collection
* Router
* Controller

This separation keeps the database connections well isolated. Heavier computation
generally lives in the backend to keep the application responsive.

### Ansible
Contains the Ansible playbook and a test inventory used to copy the generated config
to the probes.

### Controllers
Handle incoming HTTP requests. A controller reads from or writes to MongoDB and
returns a response to the frontend.

### Routes
Map the URL of an incoming request to the appropriate controller function. For
example, updating a host sends a request to `http://localhost:8000/hosts/update-host`,
which the router dispatches to the `updateHost()` function in the corresponding
controller.

### Services
Hold the heavier backend logic: config-file generation, data-validity maintenance,
and the connection to the MongoDB client instance.
