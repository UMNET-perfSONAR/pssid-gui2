<!-- Tests: the performance tests each job runs. Fields come from the test
     type's template, so the editor is built dynamically (dynamicform /
     editFormComp); apart from that it follows the same pattern as every
     section: "New test" / "Edit test" heading, name-tracked selection,
     "Create test" / "Save changes" / "Cancel" / "Delete" buttons, and a
     confirmation before deleting. The "+ New test" button in the page header
     only ever opens a blank form; it never saves anything. -->
<template>
  <div>
    <ConfirmModal
      :visible="confirmVisible"
      :message="confirmMessage"
      @confirm="onConfirm"
      @cancel="confirmVisible = false"
    />

    <PageHeader
      title="Tests"
      subtitle="Define the performance tests run by each job"
      icon="science"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New test"
      @add="startAdd"
    />

    <div v-if="!loaded" class="loading-state">
      <div class="spinner"></div>
      <span>Loading tests…</span>
    </div>

    <div v-else class="list row">
      <!-- test list -->
      <div class="col-md-6">
        <h3> Test list </h3>
        <itemList
          :item-array="testStore.tests"
          :selected-name="selectedName"
          label="Tests"
          @select="onSelect"
        ></itemList>
      </div>

      <!-- New test: name + type, then the type's template fields. -->
      <div class="col-md-6" v-if="!editing">
        <h3> New test </h3>
        <fieldset :disabled="isDisabled">
          <div class="panel-actions">
            <button type="button" class="btn btn-success" @click="submitCreateTest" :disabled="!addTestValid">
              Create test
            </button>
          </div>

          <div class="form-group">
            <label for="test-name"> Test name </label>
            <input
              type="text"
              placeholder="Enter test name"
              id="test-name"
              ref="nameInput"
              class="form-control"
              v-model="test_name"
              :aria-invalid="addNameError ? 'true' : 'false'"
              :aria-describedby="addNameError ? 'test-name-error' : null"
            />
            <small v-if="addNameError" id="test-name-error" class="text-danger" role="alert">{{ addNameError }}</small>
          </div>

          <div class="form-group">
            <label id="test-type-label"> Test type </label>
            <VueMultiselect
              v-model="selected_test"
              :multiple="false"
              :close-on-select="true"
              :options="testStore.listOfOptions"
              :searchable="false"
              aria-labelledby="test-type-label"
              @select="renderForm($event)"
            >
            </VueMultiselect>
            <small v-if="testStore.test_category" class="text-muted" style="text-transform: capitalize;">
              Category: {{ testStore.test_category }}
            </small>
          </div>

          <!-- Template-driven fields for the chosen type; the "Create test"
               button above triggers this form's validation/submit via ref. -->
          <div v-if="showForm===true">
            <dynamicform
              ref="createTestFormRef"
              @formData="createTest"
              :form_layout="allTestOptions"
              :current_item="selected_test"
              :optional_data="addedOptionalData"
              :submit-disabled="!addTestValid"
              :show-submit="false"
            >
            </dynamicform>
          </div>
        </fieldset>
      </div>

      <!-- Edit test -->
      <div class="col-md-6" v-else>
        <h3> Edit test </h3>
        <fieldset :disabled="isDisabled">
          <div class="panel-actions">
            <button type="button" class="btn btn-success" @click="submitEditTest" :disabled="!editTestValid"> Save changes </button>
            <button type="button" class="btn btn-secondary" @click="closeToAdd"> Cancel </button>
            <button type="button" class="btn btn-danger push-right" @click="requestDelete"> Delete </button>
          </div>

          <div class="form-group">
            <label for="edit-test-name"> Test name </label>
            <input
              type="text"
              placeholder="Enter test name"
              id="edit-test-name"
              class="form-control"
              v-model="currentItem.name"
              :aria-invalid="editNameError ? 'true' : 'false'"
              :aria-describedby="editNameError ? 'edit-test-name-error' : null"
            />
            <small v-if="editNameError" id="edit-test-name-error" class="text-danger" role="alert">{{ editNameError }}</small>
          </div>

          <div class="form-group">
            <label id="edit-test-type-label"> Test type </label>
            <VueMultiselect
              v-model="currentItem.type"
              :multiple="false"
              :close-on-select="true"
              :options="testStore.listOfOptions"
              :searchable="false"
              aria-labelledby="edit-test-type-label"
              @select="renderForm($event)"
            >
            </VueMultiselect>
            <small v-if="testStore.test_category" class="text-muted" style="text-transform: capitalize;">
              Category: {{ testStore.test_category }}
            </small>
          </div>

          <!-- Same type as saved: edit the saved field values. -->
          <div v-if="viewType===origType">
            <editFormComp
              ref="editFormRef"
              :current_item="currentItem"
              @editItem="saveChanges"
              :dynamic_options="currOptionalData"
              :submit-disabled="!editTestValid"
              :show-submit="false"
            > </editFormComp>
          </div>
          <!-- Type changed: fill in the new type's fields from its template. -->
          <div v-else>
            <dynamicform
              ref="editTypeChangedFormRef"
              :form_layout="allTestOptions"
              @formData="saveChanges"
              :optional_data="currOptionalData"
              :submit-disabled="!editTestValid"
              :show-submit="false"
            >
            </dynamicform>
          </div>
        </fieldset>
      </div>
    </div>

  </div>
</template>

<script>
 import { useTestStore } from '/src/stores/test_store';
 import { useUserStore } from '/src/stores/user.store';
 import dynamicform from '../components/dynamicform.vue';
 import  VueMultiselect  from 'vue-multiselect';
 import editFormComp from '../components/edit_dynamic_form.vue';
 import itemList from '../components/list_items.vue'
 import PageHeader from '../components/PageHeader.vue'
 import ConfirmModal from '../components/ConfirmModal.vue'
 import { useToastStore } from '../stores/toast.store'
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validDisplayName } from "../utils/validators.ts"

 export default {
   components: { dynamicform, VueMultiselect, editFormComp, itemList, PageHeader, ConfirmModal },
   data() {
     return {
       loaded: false,

       /*
        * Variables for the New Test form
        */
       test_name: '',
       selected_test: '',
       // Test options for the currently selected test type.
       allTestOptions: [],
       addedOptionalData: [],
       // Whether or not to render a dynamic form. Becomes true
       // when a test type is selected.
       showForm: false,

       /*
        * Variables for the Edit Test form. selectedName is the saved name of
        * the test being edited (null = New Test mode); currentItem is a
        * deep-copied draft, so typing never changes the list.
        */
       selectedName: null,
       currentItem: {},
       origType: null,
       viewType: null,
       currOptionalData: [],

       confirmVisible: false,
       confirmMessage: '',

       // Method(s) to access the store
       testStore: useTestStore(),
       userStore: useUserStore(),
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.testStore.getTests();
     await this.testStore.getTestNames();
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
      addNameError() {
        if (!this.test_name) return '';
        const check = validDisplayName(this.test_name);
        if (!check.valid) return check.error;
        if (this.isDuplicate(this.test_name)) return 'A test with this name already exists.';
        return '';
      },
      editNameError() {
        if (!this.currentItem.name) return '';
        const check = validDisplayName(this.currentItem.name);
        if (!check.valid) return check.error;
        if (this.isDuplicate(this.currentItem.name)) return 'A test with this name already exists.';
        return '';
      },
      // The submit buttons stay grey until every field this view owns is
      // valid; the dynamic form validates its template fields on submit.
      addTestValid() {
        return validDisplayName(this.test_name).valid &&
               !this.isDuplicate(this.test_name) &&
               !!this.selected_test;
      },
      editTestValid() {
        return validDisplayName(this.currentItem.name || '').valid &&
               !this.isDuplicate(this.currentItem.name || '');
      }
    },

   methods: {
     isDuplicate(name) {
       const trimmed = (name || '').trim();
       return this.testStore.tests.some(
         (t) => t.name === trimmed && t.name !== this.selectedName
       );
     },

     // The top "Create test" button triggers the dynamic form's own
     // validation/submit through a ref, since the fields (and what counts as
     // valid) are only known once a test type's template is loaded.
     submitCreateTest() {
       if (!this.addTestValid) return;
       this.$refs.createTestFormRef?.handleFormSubmit();
     },

     // The top "Save changes" button triggers whichever child form is active:
     // the saved type's own editor, or the dynamic form for a newly chosen type.
     submitEditTest() {
       if (!this.editTestValid) return;
       if (this.viewType === this.origType) {
         this.$refs.editFormRef?.editCurItem();
       } else {
         this.$refs.editTypeChangedFormRef?.handleFormSubmit();
       }
     },

     // "+ New test" in the page header: open a blank form. If the blank form
     // is already showing, just put the cursor in it.
     startAdd() {
       if (this.editing) {
         this.closeToAdd();
       } else {
         this.focusName();
       }
     },

     closeToAdd() {
       // Reset edit state.
       this.selectedName = null;
       this.currentItem = {};
       this.origType = null;
       this.viewType = null;
       this.currOptionalData = [];

       // Reset the New Test form to blank.
       this.test_name = '';
       this.selected_test = '';
       this.showForm = false;
       this.allTestOptions = [];
       this.addedOptionalData = [];
       this.testStore.test_category = '';
       this.focusName();
     },

     focusName() {
       this.$nextTick(() => {
         if (this.$refs.nameInput) this.$refs.nameInput.focus();
       });
     },

     // A list row was clicked (or chosen with the keyboard). Clicking the test
     // that is already open closes the editor; anything else opens that test.
     async onSelect(item) {
       if (this.editing && item.name === this.selectedName) {
         this.closeToAdd();
         return;
       }
       await this.applySelection(item);
     },

     async applySelection(test) {
        // Deep-copy the saved spec so edits never touch the list until saved.
        const data = JSON.parse(JSON.stringify(test.spec));
        this.viewType = test.type;
        await this.testStore.getDesiredTest(test.type);

        this.currOptionalData = [];

        // First slice the required fields from the data array.
        const spec = data.slice(0, this.testStore.test_options.length);

        // Then add optional data, if any.
        for (let ind = this.testStore.test_options.length; ind < data.length; ind++) {
          this.currOptionalData.push({ key: data[ind].key, value: data[ind].value });
        }

        this.selectedName = test.name;
        this.currentItem = {
          name: test.name,
          spec: spec,
          type: test.type
        };
        this.origType = test.type;
     },

     async renderForm(form_type) {
       this.viewType = form_type;
       await this.testStore.getDesiredTest(form_type);
       // Copy, don't mutate, the store's template array.
       this.allTestOptions = [
         ...this.testStore.test_options,
         { 'type': 'optional', 'name': 'Optional Data' }
       ];
       this.showForm = true;
     },

     // Creates a new test (from the dynamic form's "Create test" button).
     async createTest(form_data) {
       const nameCheck = validDisplayName(this.test_name);
       if (!nameCheck.valid) {
         useToastStore().show('Test name: ' + nameCheck.error, 'error');
         return;
       }
       const obj = this.testStore.formatPostData(form_data, this.addedOptionalData);
       const ok = await this.testStore.addTest({
         name: this.test_name.trim(),
         type: this.selected_test,
         spec: obj
       });
       // Keep the typed values when the server rejects the test; reset to a
       // blank form only on success.
       if (ok) {
         this.closeToAdd();
       }
     },

     async validateTest(data) {
       await this.testStore.getDesiredTest(this.currentItem.type);
       this.allTestOptions = [...this.testStore.test_options];

       let errorMessage = '';
       Object.entries(data).forEach(([key, value]) => {
         const testOption = this.allTestOptions.find(option => option.name === key);
         // A field the current template no longer declares has nothing to
         // validate against; skip it rather than crash.
         if (!testOption) return;
         const validatorStr = testOption.hasOwnProperty('validator') ?
           testOption.validator : 'return true;';
         const description = testOption.hasOwnProperty('description') ?
           testOption.description : 'Invalid input for ' + key;
         const validator = new Function('input', validatorStr);
         if (!validator(value)) {
           errorMessage += description + '\n';
         }
       });

       return errorMessage;
     },

     /**
      * Updates the selected test using a put request.
      *
      * @param {*} editFormInputs - an array where each entry is
      * an input field and its metadata (validation, etc.)
      */
     async saveChanges(editFormInputs) {
       const nameCheck = validDisplayName(this.currentItem.name);
       if (!nameCheck.valid) {
         useToastStore().show('Test name: ' + nameCheck.error, 'error');
         return;
       }

       // validateTest does not need the metadata of each field. It knows that
       // by calling getDesiredTest and it only needs the input value of each field.
       const dataToValidate = editFormInputs.reduce((result, item)=> {
         result[item.name] = item.value;
         return result;
       }, {});
       let errorMessage = await this.validateTest(dataToValidate);
       if (errorMessage.length > 0) {
         errorMessage = 'Please fix the following errors:\n' + errorMessage;
         useToastStore().show(errorMessage, 'error');
         // The draft keeps the typed values so they can be corrected in place.
         return;
       }

       const newName = this.currentItem.name.trim();
       const ok = await this.testStore.editTest({
         "old_testname" : this.selectedName,
         "new_testname" : newName,
         "type" : this.currentItem.type,
         "spec" : editFormInputs.concat(this.currOptionalData),
       });
       if (!ok) return;
       await this.testStore.getTests();
       // A saved edit is no longer "the originally selected item", so return to
       // a clean state rather than re-highlighting the row.
       this.closeToAdd();
     },

     requestDelete() {
       this.confirmMessage = `Delete test "${this.selectedName}"? It will also be removed ` +
         `from any jobs that use it. This cannot be undone.`;
       this.confirmVisible = true;
     },

     async onConfirm() {
       this.confirmVisible = false;
       const ok = await this.testStore.deleteTest({ name: this.selectedName });
       await this.testStore.getTests();
       if (ok) {
         this.closeToAdd();
       }
     }
   }
 }
</script>

<style src="vue-multiselect/dist/vue-multiselect.css"></style>
