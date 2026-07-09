<!-- Batches: deployable bundles of jobs, schedules and SSID profiles. Same
     editor pattern as every section: one panel headed "New batch" / "Edit
     batch", a draft buffer (the list never shows half-typed edits),
     name-tracked selection, and the standard "Create batch" / "Save changes" /
     "Cancel" / "Delete" buttons with confirmation before deleting or
     discarding unsaved changes. -->
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
      title="Batches"
      subtitle="Group jobs, schedules, and SSID profiles into deployable probe configurations"
      icon="work_history"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New batch"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state">
      <div class="spinner"></div>
      <span>Loading batches…</span>
    </div>

    <div v-else class="list row">
      <!-- batch list and regex search bar -->
      <div class="col-md-6">
        <h3> Batch list </h3>
        <itemList
          :item-array="batchStore.batches"
          :selected-name="selectedName"
          label="Batches"
          @select="onSelect"
        ></itemList>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h3>{{ editing ? 'Edit batch' : 'New batch' }}</h3>
        <form @submit.prevent="editing ? saveChanges() : createBatch()">
          <fieldset :disabled="isDisabled">
            <div class="form-group">
              <label for="batch-name"> Batch name </label>
              <input
                type="text"
                id="batch-name"
                ref="nameInput"
                placeholder="Enter batch name here"
                v-model="form.name"
                class="form-control"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'batch-name-error' : null"
              />
              <small v-if="nameError" id="batch-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>
            <div class="form-group">
              <label for="batch-interface"> Test interface </label>
              <input
                type="text"
                id="batch-interface"
                placeholder="e.g. wlan0"
                v-model="form.test_interface"
                class="form-control"
              />
              <small v-if="interfaceError" class="text-danger">{{ interfaceError }}</small>
            </div>
            <div class="form-group">
              <label id="batch-ssid-label"> SSID profiles </label>
              <VueMultiselect
                v-model="form.ssid_profiles"
                :multiple="true"
                :close-on-select="false"
                :options="ssidProfileNames"
                aria-labelledby="batch-ssid-label"
              >
              </VueMultiselect>
            </div>
            <div class="form-group">
              <label id="batch-jobs-label"> Jobs (run in the listed order) </label>
              <VueMultiselect
                v-model="form.jobs"
                :multiple="true"
                :close-on-select="false"
                :options="jobNames"
                aria-labelledby="batch-jobs-label"
              >
              </VueMultiselect>
            </div>
            <div class="form-group">
              <label id="batch-schedules-label"> Schedules </label>
              <VueMultiselect
                v-model="form.schedules"
                :multiple="true"
                :close-on-select="false"
                :options="scheduleNames"
                aria-labelledby="batch-schedules-label"
              >
              </VueMultiselect>
            </div>
            <div class="form-group">
              <label for="batch-priority"> Priority </label>
              <input
                type="number"
                id="batch-priority"
                placeholder="0"
                min="0"
                class="form-control"
                v-model.number="form.priority"
              />
              <small v-if="priorityError" class="text-danger">{{ priorityError }}</small>
            </div>

            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create batch
              </button>
              <template v-else>
                <button type="submit" class="btn btn-success" :disabled="!formValid"> Save changes </button>
                <button type="button" class="btn btn-secondary" @click="requestClose"> Cancel </button>
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
 import { useBatchStore } from '../stores/batches.store';
 import itemList from '../components/list_items.vue';
 import VueMultiselect from 'vue-multiselect';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';

 import { useSsidStore } from '../stores/ssid_profiles_stores';
 import { useJobStore } from '../stores/job_store';
 import { useScheduleStore } from '../stores/schedule_store';
 import { useUserStore } from '/src/stores/user.store';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validInterfaceName, validWholeNumber } from "../utils/validators.ts"

 const blankForm = () => ({
   name: '',
   test_interface: '',
   ssid_profiles: [],
   jobs: [],
   schedules: [],
   priority: 0
 });
 const cloneForm = (form) => ({
   ...form,
   ssid_profiles: [...form.ssid_profiles],
   jobs: [...form.jobs],
   schedules: [...form.schedules]
 });

 export default {
   components: { itemList, VueMultiselect, ConfirmModal, PageHeader },
   data() {
     return {
       // Name of the batch open in the editor; null = "New batch" mode.
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
       SsidStore: useSsidStore(),
       JobStore: useJobStore(),
       scheduleStore: useScheduleStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },
   async mounted() {
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }

     await this.batchStore.getBatches();
     await this.SsidStore.getSsidProfiles();
     await this.JobStore.getJobs();
     await this.scheduleStore.getSchedules();
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
     ssidProfileNames() {
       return this.SsidStore.ssid_profiles.map((item) => item.name);
     },
     jobNames() {
       return this.JobStore.jobs.map((item) => item.name);
     },
     scheduleNames() {
       return this.scheduleStore.schedules.map((item) => item.name);
     },
     nameError() {
       if (!this.form.name) return '';
       const check = validName(this.form.name);
       if (!check.valid) return check.error;
       if (this.isDuplicateName) return 'A batch with this name already exists.';
       return '';
     },
     isDuplicateName() {
       const name = this.form.name.trim();
       return this.batchStore.batches.some(
         (b) => b.name === name && b.name !== this.selectedName
       );
     },
     interfaceError() {
       return this.form.test_interface ? validInterfaceName(this.form.test_interface).error : '';
     },
     priorityError() {
       return String(this.form.priority ?? '') !== '' ? validWholeNumber(this.form.priority).error : '';
     },
     formValid() {
       return validName(this.form.name).valid &&
              !this.isDuplicateName &&
              validInterfaceName(this.form.test_interface).valid &&
              validWholeNumber(this.form.priority).valid;
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
       if (this.editing && item.name === this.selectedName) {
         this.requestClose();
         return;
       }
       if (this.isDirty) {
         this.askDiscard('select', item);
         return;
       }
       this.applySelection(item);
     },

     applySelection(item) {
       this.selectedName = item.name;
       this.form = {
         name: item.name,
         test_interface: item.test_interface ?? '',
         ssid_profiles: [...(item.ssid_profiles || [])],
         jobs: [...(item.jobs || [])],
         schedules: [...(item.schedules || [])],
         priority: Number(item.priority ?? 0)
       };
       this.baseline = cloneForm(this.form);
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
       const target = this.editing ? `"${this.selectedName}"` : 'the new batch';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete batch "${this.selectedName}"? It will also be removed ` +
         `from any hosts and host groups that use it. This cannot be undone.`;
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

     async createBatch() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.batchStore.addBatch({
         name: this.form.name.trim(),
         test_interface: this.form.test_interface.trim(),
         priority: Number(this.form.priority),
         ssid_profiles: [...this.form.ssid_profiles],
         jobs: [...this.form.jobs],
         schedules: [...this.form.schedules],
       });
       // Keep the typed values when the server rejects the batch.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.batchStore.editBatch({
         "old_batchname": this.selectedName,
         "new_batchname": newName,
         "priority": Number(this.form.priority),
         "ssid_profiles": [...this.form.ssid_profiles],
         "schedules": [...this.form.schedules],
         "jobs": [...this.form.jobs],
         "test_interface": this.form.test_interface.trim(),
       });
       if (!ok) return;
       await this.batchStore.getBatches();
       const fresh = this.batchStore.batches.find((b) => b.name === newName);
       if (fresh) {
         this.applySelection(fresh);
       } else {
         this.closeToAdd();
       }
     },

     async executeDelete() {
       const ok = await this.batchStore.deleteBatch({ name: this.selectedName });
       await this.batchStore.getBatches();
       if (ok) {
         this.closeToAdd();
       }
     }
   }
 }
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
