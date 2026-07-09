<!-- Schedules: when and how often batches run on the probes.
     One editor panel serves both modes. Its heading says exactly what it is
     doing ("New schedule" or "Edit schedule"), and the buttons follow the
     app-wide convention: "Create schedule" when adding, "Save changes" /
     "Cancel" / "Delete" when editing. The "+ New schedule" button in the page
     header only ever opens a blank form; it never saves anything.

     Editing happens in a draft (this.form), never directly on the store item,
     so the list can't show half-typed renames, and unsaved changes are
     confirmed before they are discarded. The selected item is tracked by name,
     which stays correct while the list is filtered or refetched. -->
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
      title="Schedules"
      subtitle="Define when and how often batches run on your probes"
      icon="schedule"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New schedule"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state">
      <div class="spinner"></div>
      <span>Loading schedules…</span>
    </div>

    <div v-else class="list row">
      <!-- schedule list and regex search bar -->
      <div class="col-md-6">
        <h3> Schedule list </h3>
        <item-list
          :item-array="sortedSchedules"
          :selected-name="isDirty ? null : selectedName"
          label="Schedules"
          @select="onSelect"
        ></item-list>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h3>{{ editing ? 'Edit schedule' : 'New schedule' }}</h3>
        <form @submit.prevent="editing ? saveChanges() : createSchedule()">
          <fieldset :disabled="isDisabled">
            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create schedule
              </button>
              <template v-else>
                <button type="submit" class="btn btn-success" :disabled="!formValid"> Save changes </button>
                <button type="button" class="btn btn-secondary" @click="requestClose"> Cancel </button>
                <button type="button" class="btn btn-danger push-right" @click="requestDelete"> Delete </button>
              </template>
            </div>

            <div class="form-group">
              <label for="schedule-name"> Schedule name </label>
              <input
                type="text"
                id="schedule-name"
                ref="nameInput"
                class="form-control"
                placeholder="e.g. Every 5 minutes"
                v-model="form.name"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'schedule-name-error' : null"
              />
              <small v-if="nameError" id="schedule-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>

            <CronField v-model="form.repeat" />
          </fieldset>
        </form>
      </div>
    </div>

  </div>
</template>

<script>
 import { useScheduleStore } from '/src/stores/schedule_store';
 import { useUserStore } from '/src/stores/user.store';
 import CronField from '../components/cron.vue';
 import itemList from '../components/list_items.vue';
 import PageHeader from '../components/PageHeader.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validDisplayName, validCron, cronPeriodMinutes } from "../utils/validators.ts"

 const DEFAULT_CRON = '* * * * *';
 const blankForm = () => ({ name: '', repeat: DEFAULT_CRON });

 export default {
   components: { CronField, itemList, PageHeader, ConfirmModal },
   data() {
     return {
       scheduleStore: useScheduleStore(),
       userStore: useUserStore(),

       // Name of the schedule open in the editor; null = "New schedule" mode.
       selectedName: null,
       // The draft being edited, and the values it started from (for the
       // unsaved-changes check).
       form: blankForm(),
       baseline: blankForm(),

       // Confirmation dialog plumbing: what is being confirmed and, for a
       // guarded selection change, which item to open afterwards.
       confirmVisible: false,
       confirmMessage: '',
       confirmButtonLabel: 'Delete',
       pendingAction: null,
       pendingItem: null,

       loaded: false,
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.scheduleStore.getSchedules();
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
       return this.form.name !== this.baseline.name ||
              this.form.repeat !== this.baseline.repeat;
     },
     nameError() {
       if (!this.form.name) return '';
       const check = validDisplayName(this.form.name);
       if (!check.valid) return check.error;
       if (this.isDuplicateName) return 'A schedule with this name already exists.';
       return '';
     },
     isDuplicateName() {
       const name = this.form.name.trim();
       return this.scheduleStore.schedules.some(
         (s) => s.name === name && s.name !== this.selectedName
       );
     },
     // Most to least frequent (every minute first, yearly last), so the list
     // reads in a predictable order instead of arbitrary insertion order. Ties
     // (equal frequency) fall back to name, so the order stays stable and
     // searchable rather than jumping around between loads.
     sortedSchedules() {
       return [...this.scheduleStore.schedules].sort((a, b) => {
         const diff = cronPeriodMinutes(a.repeat) - cronPeriodMinutes(b.repeat);
         return diff !== 0 ? diff : a.name.localeCompare(b.name);
       });
     },
     formValid() {
       return validDisplayName(this.form.name).valid &&
              !this.isDuplicateName &&
              validCron(this.form.repeat).valid;
     }
   },

   methods: {
     // "+ New schedule" in the page header: open a blank form. If a schedule
     // is being edited with unsaved changes, confirm before discarding them;
     // if the blank form is already showing, just put the cursor in it.
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

     // A list row was clicked (or chosen with the keyboard). Clicking the
     // schedule that is already open closes the editor; anything else opens
     // that schedule, after confirming if the current draft has unsaved work.
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
       this.form = { name: item.name, repeat: item.repeat };
       this.baseline = { ...this.form };
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
       const target = this.editing ? `"${this.selectedName}"` : 'the new schedule';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete schedule "${this.selectedName}"? It will also be removed ` +
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

     async createSchedule() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.scheduleStore.addSchedule({
         name: this.form.name.trim(),
         repeat: this.form.repeat.trim()
       });
       // Keep the typed values when the server rejects the schedule, so
       // nothing is lost; start a fresh blank form only on success.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.scheduleStore.updateSchedule({
         old_schedule: this.selectedName,
         new_schedule: newName,
         repeat: this.form.repeat.trim()
       });
       if (!ok) return;
       await this.scheduleStore.getSchedules();
       // A saved edit is no longer "the originally selected item", so return to
       // a clean state rather than re-highlighting the row.
       this.closeToAdd();
     },

     async executeDelete() {
       const ok = await this.scheduleStore.deleteSchedule({ name: this.selectedName });
       await this.scheduleStore.getSchedules();
       // On failure the schedule still exists; keep it open unchanged.
       if (ok) {
         this.closeToAdd();
       }
     }
   }
 }
</script>
