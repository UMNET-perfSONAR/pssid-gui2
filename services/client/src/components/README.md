# Client components

Reusable components shared across the application's pages.

### ConfirmModal.vue
Confirmation dialog shown before destructive actions such as delete.

### PageHeader.vue
Shared page header used across the views.

### ToastNotification.vue
Transient toast notifications for success and error feedback.

### cron.vue
Cron scheduling input for building and editing schedule expressions.

### dynamic_add_data.vue
Adds arbitrary optional key/value data to a record. Used in Hosts, Host Groups, and
Tests.

### dynamicform.vue
Generates a form dynamically from a field specification — each entry names a field
and its input type — and renders the matching input for each. Used for test forms,
whose fields vary by test type.

### edit_dynamic_form.vue
Generates an edit form dynamically from the type of the selected object. Used in
Tests.

### hosts_regex.vue
Regular-expression input for matching hosts by pattern.

### list_items.vue
Renders a named, searchable list of objects with a regular-expression search bar.
Used across all pages.
