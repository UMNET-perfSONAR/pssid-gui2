<!-- SSID profiles: a wireless network plus the layer 2/3 methods used to join
     it. Same editor pattern as every section: one panel headed "New SSID
     profile" / "Edit SSID profile", a draft buffer (the list never shows
     half-typed edits), name-tracked selection, and the standard "Create SSID
     profile" / "Save changes" / "Cancel" / "Delete" buttons with confirmation
     before deleting or discarding unsaved changes. -->
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
      title="SSID Profiles"
      subtitle="A wireless network plus the layer 2 and layer 3 methods used to connect to it"
      icon="wifi"
      :can-add="true"
      :add-disabled="isDisabled"
      add-label="New SSID profile"
      @add="startAdd"
    />

    <div v-if="loaded && noLayerScripts" class="alert alert-warning" role="alert">
      No layer 2 / layer 3 methods are available to select. A method is required on
      every SSID profile, so profiles cannot be saved until scripts are present in
      the configured layer 2 and layer 3 directories on the server.
    </div>

    <div v-if="!loaded" class="loading-state">
      <div class="spinner"></div>
      <span>Loading SSID profiles…</span>
    </div>

    <div v-else class="list row">
      <div class="col-md-6">
        <h3> SSID profile list </h3>
        <itemList
          :item-array="ssidStore.ssid_profiles"
          :selected-name="isDirty ? null : selectedName"
          label="SSID profiles"
          @select="onSelect"
        ></itemList>
      </div>

      <!-- One form for both modes; the heading states the mode. -->
      <div class="col-md-6">
        <h3>{{ editing ? 'Edit SSID profile' : 'New SSID profile' }}</h3>
        <form @submit.prevent="editing ? saveChanges() : createProfile()">
          <fieldset :disabled="isDisabled">
            <div class="form-group">
              <label for="ssid-profile-name"> Profile name </label>
              <input
                type="text"
                id="ssid-profile-name"
                ref="nameInput"
                placeholder="Enter profile name here"
                v-model="form.name"
                class="form-control"
                :aria-invalid="nameError ? 'true' : 'false'"
                :aria-describedby="nameError ? 'ssid-profile-name-error' : null"
              />
              <small v-if="nameError" id="ssid-profile-name-error" class="text-danger" role="alert">{{ nameError }}</small>
            </div>
            <div class="form-group">
              <label for="ssid-network-name"> SSID </label>
              <input
                type="text"
                id="ssid-network-name"
                placeholder="Wireless network name, e.g. MWireless"
                v-model="form.SSID"
                class="form-control"
              />
              <small v-if="ssidNameError" class="text-danger">{{ ssidNameError }}</small>
            </div>
            <div class="form-group">
              <label for="ssid-layer2"> Layer 2 method </label>
              <select id="ssid-layer2" v-model="form.layer2_script" class="form-control">
                <option value="" disabled>-- Select Layer 2 Method --</option>
                <option v-for="script in layerScriptsStore.layer2_scripts" :key="script" :value="script">{{ script }}</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ssid-layer3"> Layer 3 method </label>
              <select id="ssid-layer3" v-model="form.layer3_script" class="form-control">
                <option value="" disabled>-- Select Layer 3 Method --</option>
                <option v-for="script in layerScriptsStore.layer3_scripts" :key="script" :value="script">{{ script }}</option>
              </select>
            </div>

            <div class="panel-actions">
              <button v-if="!editing" type="submit" class="btn btn-success" :disabled="!formValid">
                Create SSID profile
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
 import { useSsidStore } from '/src/stores/ssid_profiles_stores';
 import { useUserStore } from '/src/stores/user.store';
 import { useLayerScriptsStore } from '../stores/layer_scripts_store';
 import itemList from '../components/list_items.vue';
 import PageHeader from '../components/PageHeader.vue';
 import ConfirmModal from '../components/ConfirmModal.vue';
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validSsidNetworkName } from "../utils/validators.ts"

 export default {
   components: { itemList, PageHeader, ConfirmModal },
   data() {
     return {
       ssidStore: useSsidStore(),
       userStore: useUserStore(),
       layerScriptsStore: useLayerScriptsStore(),

       // Name of the profile open in the editor; null = "New SSID profile" mode.
       selectedName: null,
       form: { name: '', SSID: '', layer2_script: '', layer3_script: '' },
       baseline: { name: '', SSID: '', layer2_script: '', layer3_script: '' },

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
     await this.ssidStore.getSsidProfiles();
     await this.layerScriptsStore.getLayer2Scripts();
     await this.layerScriptsStore.getLayer3Scripts();
     await this.layerScriptsStore.getDefaults();
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     // Blank form starts from the configured default methods.
     this.form = this.blankForm();
     this.baseline = this.blankForm();
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
      // A layer2/layer3 method is required on every SSID profile; saving is
      // impossible when either directory has no scripts to choose from.
      noLayerScripts() {
        return this.layerScriptsStore.layer2_scripts.length === 0 ||
               this.layerScriptsStore.layer3_scripts.length === 0;
      },
      nameError() {
        if (!this.form.name) return '';
        const check = validName(this.form.name);
        if (!check.valid) return check.error;
        if (this.isDuplicateName) return 'An SSID profile with this name already exists.';
        return '';
      },
      isDuplicateName() {
        const name = this.form.name.trim();
        return this.ssidStore.ssid_profiles.some(
          (p) => p.name === name && p.name !== this.selectedName
        );
      },
      ssidNameError() {
        return this.form.SSID ? validSsidNetworkName(this.form.SSID).error : '';
      },
      formValid() {
        return validName(this.form.name).valid &&
               !this.isDuplicateName &&
               validSsidNetworkName(this.form.SSID).valid &&
               !!this.form.layer2_script && !!this.form.layer3_script;
      }
    },

   methods: {
     defaultLayer2() {
       return this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer2_scripts, 'default_layer2');
     },
     defaultLayer3() {
       return this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer3_scripts, 'default_layer3');
     },
     blankForm() {
       return {
         name: '',
         SSID: '',
         layer2_script: this.defaultLayer2() || '',
         layer3_script: this.defaultLayer3() || ''
       };
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
         SSID: item.SSID ?? '',
         // Pre-fill a method default for profiles created before these fields
         // existed, on the draft only; nothing is stored until Save.
         layer2_script: item.layer2_script || this.defaultLayer2() || '',
         layer3_script: item.layer3_script || this.defaultLayer3() || ''
       };
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
       this.form = this.blankForm();
       this.baseline = this.blankForm();
       this.focusName();
     },

     focusName() {
       this.$nextTick(() => {
         if (this.$refs.nameInput) this.$refs.nameInput.focus();
       });
     },

     askDiscard(action, item = null) {
       const target = this.editing ? `"${this.selectedName}"` : 'the new SSID profile';
       this.confirmMessage = `Discard your unsaved changes to ${target}?`;
       this.confirmButtonLabel = 'Discard changes';
       this.pendingAction = action;
       this.pendingItem = item;
       this.confirmVisible = true;
     },

     requestDelete() {
       this.confirmMessage = `Delete SSID profile "${this.selectedName}"? It will also be ` +
         `removed from any batches that use it. This cannot be undone.`;
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

     async createProfile() {
       if (!this.formValid || this.isDisabled) return;   // also guards Enter-key submission
       const ok = await this.ssidStore.addSsidProfile({
         name: this.form.name.trim(),
         SSID: this.form.SSID,
         layer2_script: this.form.layer2_script,
         layer3_script: this.form.layer3_script,
       });
       // Keep the typed values when the server rejects the profile.
       if (ok) {
         this.closeToAdd();
       }
     },

     async saveChanges() {
       if (!this.formValid || this.isDisabled) return;
       const newName = this.form.name.trim();
       const ok = await this.ssidStore.editSsidProfile({
         old_ssid_name: this.selectedName,
         new_ssid_name: newName,
         SSID: this.form.SSID || '',
         layer2_script: this.form.layer2_script || '',
         layer3_script: this.form.layer3_script || '',
       });
       if (!ok) return;
       await this.ssidStore.getSsidProfiles();
       // A saved edit is no longer "the originally selected item", so return to
       // a clean state rather than re-highlighting the row.
       this.closeToAdd();
     },

     async executeDelete() {
       const ok = await this.ssidStore.deleteSsidProfile({ name: this.selectedName });
       await this.ssidStore.getSsidProfiles();
       if (ok) {
         this.closeToAdd();
       }
     },
   }
 }
</script>
