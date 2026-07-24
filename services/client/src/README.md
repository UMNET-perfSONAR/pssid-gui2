# Frontend directory overview

### assets/
Global styles and theme assets for the web application.

### components/
Reusable components used across the application. Key files include:
* `cron.vue` — cron scheduling input.
* `list_items.vue` — regular-expression search bar and list rendering for a set of
  objects; used by every page.
* `dynamic_add_data.vue` — arbitrary key/value data entry, used in Hosts, Host
  Groups, and Tests.
* `dynamicform.vue` — renders forms that vary by test type.

### stores/
Pinia stores, one per page, holding the frontend state-management logic: API calls to
the backend and the more involved data manipulation.

Pinia is a state-management library that tracks the state currently rendered in Vue,
so a single piece of state can be shared across pages. Each configuration-file page
has a corresponding store, letting the application load related objects quickly. For
example, the Host Groups page reads the host store to access every host name, avoiding
a second HTTP GET to fetch the hosts again.

See the [Pinia documentation](https://pinia.vuejs.org/) for more.

### views/
One `.vue` file per page of the web application.
