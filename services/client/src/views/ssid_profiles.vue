<template>
  <div>
    <PageHeader
      title="SSID Profiles"
      subtitle="A wireless network plus the layer 2 and layer 3 methods used to connect to it"
      icon="wifi"
      :can-add="!isDisabled && !showAddSSID"
      add-label="Add SSID Profile"
      @add="addSsidForm"
    />

    <div v-if="mount && noLayerScripts" class="alert alert-warning" role="alert">
      No layer 2 / layer 3 methods are available to select. A method is required on
      every SSID profile, so profiles cannot be saved until scripts are present in
      the configured layer 2 and layer 3 directories on the server.
    </div>

    <div v-if="ssidStore.isLoading===true" class="loading-state">
      <div class="spinner"></div>
      <span>Loading SSID profiles…</span>
    </div>

    <div class="list row">
      <div class="col-md-6" v-if="ssidStore.ssid_profiles.length === 0">
        <h3> SSID Profile List </h3>
        <p> SSID profile list is empty </p>
      </div>
      <div class="col-md-6" v-else>
        <h3> SSID Profile List </h3>
        <itemList v-if="mount == true" :item-array="ssidStore.ssid_profiles" :display="showAddSSID"
          @updateActive="updateActiveSSID" style="cursor:pointer;"></itemList>
      </div>

      <!-- Add SSID profile form -->
      <div class="col-md-6" v-if="showAddSSID==true">
        <h3> Add SSID Profile </h3>
        <form @submit.prevent="addSsid">
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label> Profile Name </label>
            <input type="text" placeholder="Enter profile name here" v-model="add_name" class="form-control" required />
            <small v-if="addProfileNameError" class="text-danger">{{ addProfileNameError }}</small>
          </div>
          <div class="form-group">
            <label> SSID </label>
            <input type="text" placeholder="Wireless network name, e.g. eduroam" v-model="add_SSID" class="form-control" required />
            <small v-if="addSsidNameError" class="text-danger">{{ addSsidNameError }}</small>
          </div>
          <div class="form-group">
            <label> Layer 2 Method </label>
            <select v-model="add_layer2_script" class="form-control" required>
              <option value="" disabled>-- Select Layer 2 Method --</option>
              <option v-for="script in layerScriptsStore.layer2_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
          </div>
          <div class="form-group">
            <label> Layer 3 Method </label>
            <select v-model="add_layer3_script" class="form-control" required>
              <option value="" disabled>-- Select Layer 3 Method --</option>
              <option v-for="script in layerScriptsStore.layer3_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
          </div>
          <div class="mb-3">
            <button class="btn btn-success" :disabled="!addSsidValid"> Add SSID Profile </button>
          </div>
          </fieldset>
        </form>
      </div>

      <!-- Edit SSID profile form -->
      <div class="col-md-6" v-if="showAddSSID==false">
        <h3> Edit SSID Profile </h3>
        <form @submit.prevent="editCurItem">
          <fieldset :disabled="isDisabled">
          <div class="form-group">
            <label> Profile Name </label>
            <input type="text" placeholder="Enter profile name here" v-model="currentItem.name" class="form-control" required />
            <small v-if="editProfileNameError" class="text-danger">{{ editProfileNameError }}</small>
          </div>
          <div class="form-group">
            <label> SSID </label>
            <input type="text" placeholder="Wireless network name, e.g. eduroam" v-model="currentItem.SSID" class="form-control" required />
            <small v-if="editSsidNameError" class="text-danger">{{ editSsidNameError }}</small>
          </div>
          <div class="form-group">
            <label> Layer 2 Method </label>
            <select v-model="currentItem.layer2_script" class="form-control" required>
              <option value="" disabled>-- Select Layer 2 Method --</option>
              <option v-for="script in layerScriptsStore.layer2_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
          </div>
          <div class="form-group">
            <label> Layer 3 Method </label>
            <select v-model="currentItem.layer3_script" class="form-control" required>
              <option value="" disabled>-- Select Layer 3 Method --</option>
              <option v-for="script in layerScriptsStore.layer3_scripts" :key="script" :value="script">{{ script }}</option>
            </select>
          </div>
          <div class="d-flex flex-wrap mb-3" style="gap: 0.5rem;">
            <button class="btn btn-success" :disabled="!editSsidValid"> Update </button>
            <button class="btn btn-danger" type="button" @click="deleteCurItem"> Delete </button>
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
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"
 import { validName, validSsidNetworkName } from "../utils/validators.ts"

 export default {
   components: { itemList, PageHeader },
   data() {
     return {
       ssidStore: useSsidStore(),
       userStore: useUserStore(),
       layerScriptsStore: useLayerScriptsStore(),

       currentIndex: {},
       currentItem: {},
       old_ssidName: '',

       showAddSSID: true,

       // Add SSID profile form fields.
       add_name: '',
       add_SSID: '',
       add_layer2_script: '',
       add_layer3_script: '',

       mount: false,
       enable_sso: config.ENABLE_SSO,
     }
   },

   async mounted() {
     await this.ssidStore.getSsidProfiles();
     await this.layerScriptsStore.getLayer2Scripts();
     await this.layerScriptsStore.getLayer3Scripts();
     await this.layerScriptsStore.getDefaults();
     this.add_layer2_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer2_scripts, 'default_layer2');
     this.add_layer3_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer3_scripts, 'default_layer3');
     if (this.enable_sso) {
       await this.userStore.fetchUser();
     }
     this.mount = true;
   },

   computed: {
      isDisabled() {
        return isFormDisabled();
      },
      // A layer2/layer3 method is required on every SSID profile; saving is
      // impossible when either directory has no scripts to choose from.
      noLayerScripts() {
        return this.layerScriptsStore.layer2_scripts.length === 0 ||
               this.layerScriptsStore.layer3_scripts.length === 0;
      },
      addProfileNameError() {
        return this.add_name ? validName(this.add_name).error : '';
      },
      addSsidNameError() {
        return this.add_SSID ? validSsidNetworkName(this.add_SSID).error : '';
      },
      addSsidValid() {
        return validName(this.add_name).valid &&
               validSsidNetworkName(this.add_SSID).valid &&
               !!this.add_layer2_script && !!this.add_layer3_script;
      },
      editProfileNameError() {
        return this.currentItem.name ? validName(this.currentItem.name).error : '';
      },
      editSsidNameError() {
        return this.currentItem.SSID ? validSsidNetworkName(this.currentItem.SSID).error : '';
      },
      editSsidValid() {
        return validName(this.currentItem.name || '').valid &&
               validSsidNetworkName(this.currentItem.SSID || '').valid &&
               !!this.currentItem.layer2_script && !!this.currentItem.layer3_script;
      }
    },

   methods: {
     addSsidForm() {
       this.showAddSSID = true;
       this.currentIndex = {};
       this.currentItem = {};
     },

     updateActiveSSID(indexArray) {
      const [newItem, newIndex] = indexArray;
      if (
        this.currentItem &&
        this.currentItem.name === newItem.name &&
        this.currentIndex === newIndex
      ) {
        this.currentItem = {};
        this.currentIndex = {};
        this.showAddSSID = true;
      } else {
        this.currentItem = newItem;
        this.currentIndex = newIndex;
        this.old_ssidName = newItem.name;
        // Pre-fill a method default for profiles created before these fields existed.
        if (!this.currentItem.layer2_script) {
          this.currentItem.layer2_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer2_scripts, 'default_layer2');
        }
        if (!this.currentItem.layer3_script) {
          this.currentItem.layer3_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer3_scripts, 'default_layer3');
        }
        this.showAddSSID = false;
     }
    },

     async addSsid() {
       await this.ssidStore.addSsidProfile({
         name: this.add_name,
         SSID: this.add_SSID,
         layer2_script: this.add_layer2_script,
         layer3_script: this.add_layer3_script,
       });
       this.add_name = '';
       this.add_SSID = '';
       this.add_layer2_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer2_scripts, 'default_layer2');
       this.add_layer3_script = this.layerScriptsStore.resolveDefault(this.layerScriptsStore.layer3_scripts, 'default_layer3');
       this.addSsidForm();
     },

     async editCurItem() {
       await this.ssidStore.editSsidProfile({
         old_ssid_name: this.old_ssidName,
         new_ssid_name: this.currentItem.name,
         SSID: this.currentItem.SSID || '',
         layer2_script: this.currentItem.layer2_script || '',
         layer3_script: this.currentItem.layer3_script || '',
       });
       await this.ssidStore.getSsidProfiles();
       this.currentItem = this.ssidStore.ssid_profiles[this.currentIndex];
       this.updateActiveSSID([this.currentItem, this.currentIndex]);
     },

     async deleteCurItem() {
       const deleteIndex = this.currentIndex;
       this.ssidStore.ssid_profiles.splice(deleteIndex, 1);
       await this.ssidStore.deleteSsidProfile(this.currentItem);
       if (this.ssidStore.ssid_profiles.length <= deleteIndex) {
         this.addSsidForm();
       } else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.ssidStore.ssid_profiles[deleteIndex];
         this.updateActiveSSID([this.currentItem, this.currentIndex]);
       }
     },
   }
 }
</script>
