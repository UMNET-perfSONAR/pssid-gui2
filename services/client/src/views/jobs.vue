<!-- Jobs: reusable bundles of tests. Same editor pattern as every section:
     one panel headed "New job" / "Edit job", a draft buffer (the list never
     shows half-typed edits), name-tracked selection, and the standard
     "Create job" / "Save changes" / "Cancel" / "Delete" buttons with
     confirmation before deleting or discarding unsaved changes. -->
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
      title="Jobs"
      subtitle="Combine tests into reusable job configurations"
      icon="folder_copy"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New job"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state" role="status" aria-live="polite">
      <div class="spinner"></div>
      <span>Loading jobs…</span>
    </div>

    <div v-else class="list row">
      <!-- job list and regex search bar-->
      <div class="col-md-6">
        <h2> Job list </h2>
        <itemList
          :item-array="jobStore.jobs"
          :selected-name="isDirty ? null : selectedName"
          label="Jobs"
          @select="onSelect"
        ></itemList>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h2>{{ editing ? 'Edit job' : 'New job' }}</h2>
        <form @submit.prevent="editing ? saveChanges() : createJob()">
          <fieldset :disabled="isDisabled">
            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create job
              </button>
              <template v-else>
                <button type="submit" class="btn btn-success" :disabled="!formValid"> Save changes </button>
                <button type="button" class="btn btn-secondary" @click="requestClose"> Cancel </button>
                <button type="button" class="btn btn-danger push-right" @click="requestDelete"> Delete </button>
              </template>
            </div>

            <div class="form-group">
              <label for="job-name"> Job name </label>
              <input
                type="text"
                id="job-name"
                ref="nameInput"
                placeholder="Enter job name"
                class="form-control"
                v-model="form.name"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'job-name-error' : null"
              />
              <small v-if="nameError" id="job-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>

            <div class="form-group">
              <label id="job-tests-label"> Tests (run in the listed order) </label>
              <VueMultiselect
                v-model="form.tests"
                :multiple="true"
                :close-on-select="false"
                :options="testNames"
                aria-labelledby="job-tests-label"
              >
              </VueMultiselect>
            </div>

            <div class="form-group">
              <label for="job-continue-if"> Continue-if (jq expression) </label>
              <input
                type="text"
                id="job-continue-if"
                placeholder="jq expression, e.g. true"
                class="form-control"
                v-model="form.continueIf"
                :aria-invalid="continueIfError ? 'true' : 'false'"
                :aria-describedby="continueIfError ? 'job-continue-if-error' : null"
              />
              <small v-if="continueIfError" id="job-continue-if-error" class="text-danger" role="alert">{{ continueIfError }}</small>
            </div>

            <div class="form-group">
              <label for="job-backoff"> Backoff (ISO 8601 duration) </label>
              <input
                type="text"
                id="job-backoff"
                placeholder="e.g. PT1S, PT30S, PT5M"
                class="form-control"
                v-model="form.backoff"
                :aria-invalid="backoffError ? 'true' : 'false'"
                :aria-describedby="backoffError ? 'job-backoff-error' : null"
              />
              <small v-if="backoffError" id="job-backoff-error" class="text-danger" role="alert">{{ backoffError }}</small>
            </div>
          </fieldset>
        </form>
      </div>
    </div>

  </div>
</template>

<script>
 import { useJobStore } from '../stores/job_store.ts'
 import { useTestStore } from '../stores/test_store.ts';
 import { useUserStore } from '/src/stores/user.store';
 import VueMultiselect from 'vue-multiselect';
 import itemList from '../components/list_items.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import PageHeader from '../components/PageHeader.vue';
 import config from '../shared/config';
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validIso8601Duration, validJqClause } from "../utils/validators.ts"

 const blankForm = () => ({ name: '', tests: [], continueIf: 'true', backoff: 'PT1S' });
 const cloneForm = (form) => ({ ...form, tests: [...form.tests] });

 export default {
   components: { VueMultiselect, itemList, ConfirmModal, PageHeader },
   data() {
     return {
       // Name of the job open in the editor; null = "New job" mode.
       selectedName: null,
       form: blankForm(),
       baseline: blankForm(),

       confirmVisible: false,
       confirmMessage: '',
       confirmButtonLabel: 'Delete',
       pendingAction: null,
       pendingItem: null,

       loaded: false,

       jobStore: useJobStore(),
       testStore: useTestStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO
     }
   },

   async mounted() {
     // Always fetched: carries the server's effective auth posture as well as
     // the identity. See the note in schedules.vue.
     await this.userStore.fetchUser();
     await this.jobStore.getJobs();
     await this.testStore.getTests();
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
     testNames() {
       return this.testStore.tests.map((t) => t.name);
     },
     nameError() {
       if (!this.form.name) return '';
       const check = validName(this.form.name);
       if (!check.valid) return check.error;
       if (this.isDuplicateName) return 'A job with this name already exists.';
       return '';
     },
     isDuplicateName() {
       const name = this.form.name.trim();
       return this.jobStore.jobs.some(
         (j) => j.name === name && j.name !== this.selectedName
       );
     },
     backoffError() {
       return this.form.backoff ? validIso8601Duration(this.form.backoff).error : '';
     },
     continueIfError() {
       return this.form.continueIf ? validJqClause(this.form.continueIf).error : '';
     },
     formValid() {
       return validName(this.form.name).valid &&
              !this.isDuplicateName &&
              validIso8601Duration(this.form.backoff).valid &&
              validJqClause(this.form.continueIf).valid;
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
         tests: [...(item.tests || [])],
         continueIf: item['continue-if'] ?? '',
         backoff: item.backoff ?? ''
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
       const target = this.editing ? `"${this.selectedName}"` : 'the new job';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete job "${this.selectedName}"? It will also be removed ` +
         `from any batches that use it. This cannot be undone.`;
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

     async createJob() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.jobStore.addJob({
         name: this.form.name.trim(),
         tests: [...this.form.tests],
         "continue-if": this.form.continueIf.trim(),
         backoff: this.form.backoff.trim()
       });
       // Keep the typed values when the server rejects the job.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.jobStore.updateJob({
         old_job: this.selectedName,
         new_job: newName,
         "continue-if": this.form.continueIf.trim(),
         tests: [...this.form.tests],
         backoff: this.form.backoff.trim()
       });
       if (!ok) return;
       await this.jobStore.getJobs();
       // A saved edit is no longer "the originally selected item", so return to
       // a clean state rather than re-highlighting the row.
       this.closeToAdd();
     },

     async executeDelete() {
       const ok = await this.jobStore.deleteJob({ name: this.selectedName });
       await this.jobStore.getJobs();
       if (ok) {
         this.closeToAdd();
       }
     }
   }
 }
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
