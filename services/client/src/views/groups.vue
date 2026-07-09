<!-- Host groups: named sets of hosts for bulk provisioning. Same editor
     pattern as every section: one panel headed "New host group" / "Edit host
     group", a draft buffer (the list never shows half-typed edits),
     name-tracked selection, and the standard "Create host group" / "Save
     changes" / "Cancel" / "Delete" buttons with confirmation before deleting
     or discarding unsaved changes. Provisioning the selected group lives in
     the editor too, and is disabled while the draft has unsaved changes so it
     always pushes exactly what is saved. -->
<template>
  <div>
    <ConfirmModal
      :visible="confirmVisible"
      :message="confirmMessage"
      :confirm-label="confirmButtonLabel"
      @confirm="onConfirm"
      @cancel="confirmVisible = false"
    />

    <PageHeader
      title="Host Groups"
      subtitle="Organize hosts into groups for bulk provisioning"
      icon="lan"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New host group"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state">
      <div class="spinner"></div>
      <span>Loading host groups…</span>
    </div>

    <div v-else class="list row">
      <!-- Host Group List -->
      <div class="col-md-6">
        <h3> Host group list </h3>
        <item-list
          :item-array="hostGroup.host_groups"
          :selected-name="isDirty ? null : selectedName"
          label="Host groups"
          @select="onSelect"
        ></item-list>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h3>{{ editing ? 'Edit host group' : 'New host group' }}</h3>
        <form @submit.prevent="editing ? saveChanges() : createGroup()">
          <fieldset :disabled="isDisabled">
            <div class="form-group">
              <label for="group-name"> Group name </label>
              <input
                type="text"
                id="group-name"
                ref="nameInput"
                placeholder="Enter host group name"
                v-model="form.name"
                class="form-control"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'group-name-error' : null"
              />
              <small v-if="nameError" id="group-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>

            <hostSelection :copy_of_data="hostChoices"></hostSelection>

            <div class="form-group">
              <label> Host regex input </label>
              <hostRegex :regex_array="form.regex"></hostRegex>
            </div>
            <div class="form-group">
              <label id="group-batches-label"> Batch selection </label>
              <VueMultiselect
                v-model="form.batches"
                :options="batchNames"
                :multiple="true"
                :close-on-select="false"
                aria-labelledby="group-batches-label"
              >
              </VueMultiselect>
            </div>
            <label class="form-group-label"> Metadata </label>
            <dynamic_add_data :addedData="form.meta"></dynamic_add_data>

            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create host group
              </button>
              <template v-else>
                <button type="submit" class="btn btn-success" :disabled="!formValid"> Save changes </button>
                <button type="button" class="btn btn-secondary" @click="requestClose"> Cancel </button>
                <button
                  type="button"
                  class="btn btn-warning"
                  @click="provisionGroup"
                  :disabled="isDisabled || isDirty"
                  :title="isDirty ? 'Save or cancel your changes first — provisioning pushes the saved configuration' : 'Write the generated config and run the provision script for every probe in this group'"
                >
                  Provision this group
                </button>
                <button type="button" class="btn btn-danger push-right" @click="requestDelete"> Delete </button>
              </template>
            </div>
          </fieldset>
        </form>
      </div>
    </div>

  </div>
</template>

<script>
 import { useGroupStore } from '/src/stores/groups_stores';
 import { useBatchStore } from '/src/stores/batches.store';
 import { useHostStore } from '/src/stores/host_store.ts';
 import { useUserStore } from '/src/stores/user.store';
 import { defineComponent } from 'vue';
 import hostRegex from '../components/hosts_regex.vue';
 import VueMultiselect from 'vue-multiselect';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import hostSelection from '../forms/hostSelection.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName } from "../utils/validators.ts"

 const blankForm = () => ({ name: '', batches: [], regex: [], meta: [] });
 const cloneForm = (form) => ({
   name: form.name,
   batches: [...form.batches],
   regex: form.regex.map((row) => ({ ...row })),
   meta: form.meta.map((row) => ({ ...row }))
 });
 // Rows the user added but left completely empty carry no information; drop
 // them instead of writing "": "" metadata or an empty regex (which would
 // match every host) into the group.
 const metaToObject = (meta) => meta
   .filter((row) => (row.key ?? '') !== '' || (row.value ?? '') !== '')
   .reduce((result, row) => {
     result[row.key] = row.value;
     return result;
   }, {});
 const regexToList = (regex) => regex
   .map((row) => row.regex ?? '')
   .filter((pattern) => pattern.trim() !== '');

 export default defineComponent({
   components: { VueMultiselect, itemList, hostRegex, dynamic_add_data, hostSelection, ConfirmModal, PageHeader },
   data() {
     return {
       // Name of the group open in the editor; null = "New host group" mode.
       selectedName: null,
       form: blankForm(),
       baseline: blankForm(),
       // One row per known host for the host picker; `selected` marks group
       // membership. Rebuilt whenever the editor switches item or mode.
       hostChoices: [],
       baselineHostNames: '',

       confirmVisible: false,
       confirmMessage: '',
       confirmButtonLabel: 'Delete',
       pendingAction: null,
       pendingItem: null,

       loaded: false,

       hostStore: useHostStore(),
       hostGroup: useGroupStore(),
       batchStore: useBatchStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.hostGroup.getGroups();
     await this.batchStore.getBatches();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.hostChoices = this.buildHostChoices();
     this.loaded = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     editing() {
       return this.selectedName !== null;
     },
     selectedHostNames() {
       return this.hostChoices.filter((h) => h.selected).map((h) => h.name);
     },
     isDirty() {
       return JSON.stringify(this.form) !== JSON.stringify(this.baseline) ||
              [...this.selectedHostNames].sort().join('\n') !== this.baselineHostNames;
     },
     batchNames() {
       return this.batchStore.batches.map((item) => item.name);
     },
     // The saved (store) version of the selected group — what provisioning acts on.
     storeItem() {
       return this.hostGroup.host_groups.find((g) => g.name === this.selectedName) || null;
     },
     nameError() {
       if (!this.form.name) return '';
       const check = validName(this.form.name);
       if (!check.valid) return check.error;
       if (this.isDuplicateName) return 'A host group with this name already exists.';
       return '';
     },
     isDuplicateName() {
       const name = this.form.name.trim();
       return this.hostGroup.host_groups.some(
         (g) => g.name === name && g.name !== this.selectedName
       );
     },
     formValid() {
       return validName(this.form.name).valid && !this.isDuplicateName;
     }
   },

   methods: {
     // A picker row per known host. Membership is matched by name, so a group
     // that still references a since-deleted host simply has no row for it
     // (and saving the group drops the stale reference).
     buildHostChoices(memberNames = []) {
       const members = new Set(memberNames);
       return this.hostStore.hosts.map((host, index) => ({
         name: host.name,
         selected: members.has(host.name),
         index: index
       }));
     },

     startAdd() {
       if (!this.editing) {
         this.focusName();
         return;
       }
       if (this.isDirty) {
         this.askDiscard('close');
       } else {
         this.closeToAdd();
       }
     },

     onSelect(item) {
       // A modified draft detaches the list highlight, so clicking any row —
       // including the one being edited — reloads that row's saved values,
       // after confirming that unsaved changes are discarded.
       if (this.isDirty) {
         this.askDiscard('select', item);
         return;
       }
       // Nothing unsaved: clicking the highlighted row again closes the editor.
       if (this.editing && item.name === this.selectedName) {
         this.closeToAdd();
         return;
       }
       this.applySelection(item);
     },

     applySelection(group) {
       this.selectedName = group.name;
       this.form = {
         name: group.name,
         batches: [...(group.batches || [])],
         regex: (group.hosts_regex || []).map((pattern) => ({ regex: pattern })),
         meta: Object.entries(group.data || {}).map(([key, value]) => ({ key, value }))
       };
       this.baseline = cloneForm(this.form);
       this.hostChoices = this.buildHostChoices(group.hosts || []);
       this.baselineHostNames = [...this.selectedHostNames].sort().join('\n');
     },

     requestClose() {
       if (this.isDirty) {
         this.askDiscard('close');
       } else {
         this.closeToAdd();
       }
     },

     closeToAdd() {
       this.selectedName = null;
       this.form = blankForm();
       this.baseline = blankForm();
       this.hostChoices = this.buildHostChoices();
       this.baselineHostNames = '';
       this.focusName();
     },

     focusName() {
       this.$nextTick(() => {
         if (this.$refs.nameInput) this.$refs.nameInput.focus();
       });
     },

     askDiscard(action, item = null) {
       const target = this.editing ? `"${this.selectedName}"` : 'the new host group';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete host group "${this.selectedName}"? The hosts in it are ` +
         `not deleted. This cannot be undone.`;
       this.confirmButtonLabel = 'Delete';
       this.pendingAction = 'delete';
       this.pendingItem = null;
       this.confirmVisible = true;
     },

     async onConfirm() {
       this.confirmVisible = false;
       const action = this.pendingAction;
       const item = this.pendingItem;
       this.pendingAction = null;
       this.pendingItem = null;

       if (action === 'delete') {
         await this.executeDelete();
       } else if (action === 'select' && item) {
         this.applySelection(item);
       } else if (action === 'close') {
         this.closeToAdd();
       }
     },

     // Provision every probe in the selected group (its saved configuration —
     // the button is disabled while the draft is dirty).
     async provisionGroup() {
       if (!this.storeItem) return;
       await this.hostGroup.createConfig(this.storeItem);
     },

     async createGroup() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.hostGroup.addGroup({
         name: this.form.name.trim(),
         batches: [...this.form.batches],
         hosts: this.selectedHostNames,
         data: metaToObject(this.form.meta),
         hosts_regex: regexToList(this.form.regex)
       });
       // Keep the typed values when the server rejects the group.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.hostGroup.editGroup({
         new_hostgroup: newName,
         old_hostgroup: this.selectedName,
         hosts: this.selectedHostNames,
         batches: [...this.form.batches],
         data: metaToObject(this.form.meta),
         hosts_regex: regexToList(this.form.regex)
       });
       if (!ok) return;
       await this.hostGroup.getGroups();
       const fresh = this.hostGroup.host_groups.find((g) => g.name === newName);
       if (fresh) {
         this.applySelection(fresh);
       } else {
         this.closeToAdd();
       }
     },

     async executeDelete() {
       const ok = await this.hostGroup.deleteGroup({ name: this.selectedName });
       await this.hostGroup.getGroups();
       if (ok) {
         this.closeToAdd();
       }
     },
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
