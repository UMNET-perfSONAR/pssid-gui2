# Adding fields to the config file

As pSSID evolves, the configuration-file requirements change. This guide outlines
the general steps to extend the web application with a new field, using the Hosts
page as a running example. The files referenced in each step are the canonical
implementations; read them alongside this guide.

Two cases are covered: fields on a standard page (such as Hosts), and fields on a
form rendered dynamically by `dynamicform.vue` (the Tests page).

## Standard pages

### Frontend

1. **Add the field to the Add and Edit forms.**

   Views live in `services/client/src/views/`. Each view keeps the user's input in a
   `form` object in `data()` and binds every input to it with `v-model`. For example,
   `hosts.vue` binds the host-name input to `form.name`:

   ```vue
   <input
     type="text"
     placeholder="Hostname or IP address"
     v-model="form.name"
     required
     class="form-control"
   >
   ```

   To add a field, add a property to the `form` object and bind a new input to it.
   The same `form` object backs both the Add and Edit forms.

2. **Send the field on submit.**

   Include the new property in the object passed to the store's add and edit methods.
   In `hosts.vue`, `createHost()` and `saveChanges()` call the host store:

   ```js
   // Add
   await this.hostStore.addHost({
     name: this.form.name.trim(),
     batches: [...this.form.batches],
     data: metaToObject(this.form.meta),
   });

   // Edit
   await this.hostStore.editHost({
     old_hostname: this.selectedName,
     new_hostname: this.form.name.trim(),
     batches: [...this.form.batches],
     data: metaToObject(this.form.meta),
   });
   ```

   The store methods (`services/client/src/stores/host_store.ts`) POST and PUT the
   object to the backend.

### Backend

3. **Persist the field in the controller.**

   Controllers live in `services/server/src/controllers/`. Add the field to the
   documents written by `collection.insertOne()` in the POST handler and
   `collection.updateOne()` in the PUT handler. In `hosts.controllers.ts`, `postHost`
   validates the request and inserts the host:

   ```ts
   await collection.insertOne({
     "name": req.body.name,
     "batches": req.body.batches,
     "batch_ids": batch_ids,
     "data": req.body.data,
   });
   ```

   Read the new value from `req.body` under the key the frontend sent, and apply the
   same change to `updateHost`.

## Dynamic forms (the Tests page)

The Tests page renders its form dynamically with `dynamicform.vue`, because the
fields depend on the selected test type. Those fields are not hardcoded in the view:
they come from the test templates on disk in `services/server/starters/tests/*.json`,
one file per test type, each declaring its parameters and validation (see
[server/README.md](server/README.md)).

To add a field to a test type, edit that test's template. `tests.vue` loads the
templates, passes them to `<dynamicform>` as `form_layout`, and receives the
submitted values through the component's `formData` event; `createTest(form_data)`
then formats them with the test store's `formatPostData` before saving. The backend
steps are the same as for a standard page.
