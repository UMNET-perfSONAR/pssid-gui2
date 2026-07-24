# Future improvements

### General
The interface has had a visual refresh, and its colors and product name are now set
per organization through the edition system (see
[../../docs/deployment.md](../../docs/deployment.md)). A formal UX review would still
be worthwhile to refine the experience further.

### dynamicform.vue
The application uses a custom dynamic-form component. Its main advantage is flexible
input validation: it accepts arbitrary, user-defined validation code supplied as
strings. Adopting an off-the-shelf dynamic-form component such as JSONForms is a
possible future direction, weighed against the low maintenance cost of the current
version (roughly 100 lines).

### src/views/
The view files contain some duplication, because several pages share nearly identical
behavior: listing existing items, editing and deleting them, and adding new ones.
Eliminating the duplication entirely is difficult, because each page has features that
do not fit a single uniform template. Directions worth exploring:

* Build on `src/components/dynamicform.vue` and `src/components/edit_dynamic_form.vue`
  and retrofit the views to reduce duplication. Page layout could be stored in a
  MongoDB collection with one document per page, keyed by name.
* Migrate the views from Vue's Options API to the Composition API.
* Move data formatting and computation (Tests especially) into the corresponding
  `src/stores/` files to slim the view files.
