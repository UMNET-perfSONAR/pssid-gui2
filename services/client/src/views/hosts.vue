<!-- Hosts: the network probes and their batch assignments. Same editor
     pattern as every section: one panel headed "New host" / "Edit host", a
     draft buffer (the list never shows half-typed edits), name-tracked
     selection, and the standard "Create host" / "Save changes" / "Cancel" /
     "Delete" buttons with confirmation before deleting or discarding unsaved
     changes. -->
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
      title="Hosts"
      subtitle="Manage network probe hosts and their batch assignments"
      icon="computer"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New host"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state" role="status" aria-live="polite">
      <div class="spinner"></div>
      <span>Loading hosts…</span>
    </div>

    <div v-else class="list row">
      <!-- List out the items -->
      <div class="col-md-6">
        <h2> Host list </h2>
        <item-list
          :item-array="hostStore.hosts"
          :selected-name="isDirty ? null : selectedName"
          label="Hosts"
          @select="onSelect"
        ></item-list>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h2>{{ editing ? 'Edit host' : 'New host' }}</h2>
        <form @submit.prevent="editing ? saveChanges() : createHost()">
          <fieldset :disabled="isDisabled">
            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create host
              </button>
              <template v-else>
                <button type="submit" class="btn btn-success" :disabled="!formValid"> Save changes </button>
                <button type="button" class="btn btn-secondary" @click="requestClose"> Cancel </button>
                <button type="button" class="btn btn-danger push-right" @click="requestDelete"> Delete </button>
              </template>
            </div>

            <div class="form-group">
              <label for="host-name"> Hostname </label>
              <input
                type="text"
                id="host-name"
                ref="nameInput"
                placeholder="Hostname or IP address"
                v-model="form.name"
                name="host-name"
                class="form-control"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'host-name-error' : null"
              >
              <small v-if="nameError" id="host-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>
            <div class="form-group">
              <label id="host-batches-label"> Batches </label>
              <VueMultiselect
                :multiple="true"
                :close-on-select="false"
                :options="batchNames"
                v-model="form.batches"
                aria-labelledby="host-batches-label"
              >
              </VueMultiselect>
            </div>
            <label class="form-group-label"> Metadata </label>
            <dynamic_add_data :addedData="form.meta"></dynamic_add_data>
          </fieldset>
        </form>
      </div>
    </div>

    <!-- Effective configuration of the selected probe: the slice of
         pssid_config.json (the one file the daemon reads) this host acts on. -->
    <div v-if="editing" class="probe-config">
      <h2 class="probe-config-title">Probe configuration</h2>
      <p class="probe-config-sub">
        Everything <strong>{{ selectedName }}</strong> will run, from the
        generated <code>pssid_config.json</code> the daemon receives.
      </p>

      <div v-if="hostStore.probeConfigLoading" class="loading-state" role="status" aria-live="polite">
        <div class="spinner"></div>
        <span>Building configuration…</span>
      </div>

      <p v-else-if="hostStore.probeConfigError" class="probe-config-error" role="alert">
        <span class="material-icons" aria-hidden="true">error</span>
        {{ hostStore.probeConfigError }}
      </p>

      <template v-else-if="hostStore.probeConfig">
        <p class="probe-config-summary">
          Groups: <strong>{{ hostStore.probeConfig.groups.join(', ') || 'none' }}</strong>
          &nbsp;·&nbsp; Batches: <strong>{{ hostStore.probeConfig.batches.map(b => b.name).join(', ') || 'none' }}</strong>
          &nbsp;·&nbsp; Config version {{ hostStore.probeConfig.config_version }}
        </p>
        <ul class="probe-batch-list">
          <li v-for="b in hostStore.probeConfig.batches" :key="b.name">
            <strong>{{ b.name }}</strong> (priority {{ b.priority }}) runs
            <template v-for="(j, i) in b.jobs" :key="j.name">
              <span class="probe-job">{{ i + 1 }}. {{ j.name }}</span><template v-if="i < b.jobs.length - 1">, then </template>
            </template>
          </li>
        </ul>
        <pre class="probe-config-pre">{{ JSON.stringify(hostStore.probeConfig, null, 2) }}</pre>
      </template>
    </div>

  </div>
</template>

<script>
 import { useHostStore } from '/src/stores/host_store';
 import { useBatchStore } from '../stores/batches.store';
 import { useUserStore } from '/src/stores/user.store';
 import { defineComponent } from 'vue';
 import itemList from '../components/list_items.vue';
 import dynamic_add_data from '../components/dynamic_add_data.vue';
 import VueMultiselect from 'vue-multiselect';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validHostOrIp } from "../utils/validators.ts"

 const blankForm = () => ({ name: '', batches: [], meta: [] });
 const cloneForm = (form) => ({
   name: form.name,
   batches: [...form.batches],
   meta: form.meta.map((row) => ({ ...row }))
 });
 // Metadata rows the user added but left completely empty carry no
 // information; drop them instead of writing "": "" pairs into the host.
 const metaToObject = (meta) => meta
   .filter((row) => (row.key ?? '') !== '' || (row.value ?? '') !== '')
   .reduce((result, row) => {
     result[row.key] = row.value;
     return result;
   }, {});

 export default defineComponent({
   components: { itemList, dynamic_add_data, VueMultiselect, ConfirmModal, PageHeader },
   data() {
     return {
       // Name of the host open in the editor; null = "New host" mode.
       selectedName: null,
       form: blankForm(),
       baseline: blankForm(),

       confirmVisible: false,
       confirmMessage: '',
       confirmButtonLabel: 'Delete',
       pendingAction: null,
       pendingItem: null,

       loaded: false,

       batchStore: useBatchStore(),
       hostStore: useHostStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },

   async mounted() {
     await this.hostStore.getHosts();
     await this.batchStore.getBatches();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.loaded = true;
   },

   computed: {
     isDisabled() {
       return isFormDisabled();
     },
     editing() {
       return this.selectedName !== null;
     },
     isDirty() {
       return JSON.stringify(this.form) !== JSON.stringify(this.baseline);
     },
     batchNames() {
       return this.batchStore.batches.map((item) => item.name);
     },
     nameError() {
       if (!this.form.name) return '';
       const check = validHostOrIp(this.form.name);
       if (!check.valid) return check.error;
       if (this.isDuplicateName) return 'A host with this name already exists.';
       return '';
     },
     isDuplicateName() {
       const name = this.form.name.trim();
       return this.hostStore.hosts.some(
         (h) => h.name === name && h.name !== this.selectedName
       );
     },
     formValid() {
       return validHostOrIp(this.form.name).valid && !this.isDuplicateName;
     }
   },

   methods: {
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
       // A modified draft detaches the list highlight, so clicking any row
       // (including the one being edited) reloads that row's saved values,
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

     applySelection(item) {
       this.selectedName = item.name;
       this.form = {
         name: item.name,
         batches: [...(item.batches || [])],
         meta: Object.entries(item.data || {}).map(([key, value]) => ({ key, value }))
       };
       this.baseline = cloneForm(this.form);
       this.hostStore.getHostConfig(item.name);
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
       this.focusName();
     },

     focusName() {
       this.$nextTick(() => {
         if (this.$refs.nameInput) this.$refs.nameInput.focus();
       });
     },

     askDiscard(action, item = null) {
       const target = this.editing ? `"${this.selectedName}"` : 'the new host';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete host "${this.selectedName}"? It will also be removed ` +
         `from any host groups that include it. This cannot be undone.`;
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

     async createHost() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.hostStore.addHost({
         name: this.form.name.trim(),
         batches: [...this.form.batches],
         data: metaToObject(this.form.meta)
       });
       // Keep the typed values when the server rejects the host.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.hostStore.editHost({
         "old_hostname": this.selectedName,
         "new_hostname": newName,
         "batches": [...this.form.batches],
         "data": metaToObject(this.form.meta)
       });
       if (!ok) return;
       await this.hostStore.getHosts();
       // A saved edit is no longer "the originally selected item", so return to
       // a clean state rather than re-highlighting the row.
       this.closeToAdd();
     },

     async executeDelete() {
       const ok = await this.hostStore.deleteHost({ name: this.selectedName });
       await this.hostStore.getHosts();
       if (ok) {
         this.closeToAdd();
       }
     }
   }
 })
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>

<style scoped>
.probe-config {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.1rem 1.25rem;
  margin-top: 1.25rem;
}
.probe-config-title {
  font-size: 0.72rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted) !important;
  margin: 0 0 0.35rem !important;
  border: none !important;
  padding: 0 !important;
}
.probe-config-sub {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.probe-config-sub code {
  background: rgba(var(--primary-rgb), .08);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text);
}
.probe-config-summary {
  font-size: 0.82rem;
  color: var(--text);
  margin: 0 0 0.35rem;
}
/* One line per batch; a batch's jobs run in their listed (numbered) order. */
.probe-batch-list {
  list-style: none;
  margin: 0 0 0.6rem;
  padding: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.probe-batch-list li {
  padding: 0.1rem 0;
}
.probe-batch-list strong {
  color: var(--text);
}
.probe-job {
  color: var(--text);
  white-space: nowrap;
}
.probe-config-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--warn-soft-fg);
  background: var(--warn-soft-bg);
  border: 1px solid var(--warn-soft-bd);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.9rem;
  margin: 0;
  white-space: pre-line;
}
.probe-config-error .material-icons {
  font-size: 1.1rem;
  flex-shrink: 0;
}
.probe-config-pre {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  line-height: 1.5;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre;
}
:global(:root[data-theme="dark"]) .probe-config-sub code {
  background: #0e1626;
}
</style>
