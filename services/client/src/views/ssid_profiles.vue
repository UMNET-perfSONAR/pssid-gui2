<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="ssidStore.isLoading===true"> 
      <p> Loading SSID Profiles page... </p>
    </div>

    <!-- Add ssid_profile button -->
    <div>
      <button style="margin-bottom: 2em;" v-if="showAddSSID"></button>
      <button @click="addSsidForm" class="btn btn-primary" v-if="!showAddSSID"
        style="margin-bottom: 1em;"> Add SSID Profile </button>
    </div>
    <h3> SSID Profile List </h3>
    <div class="list row"> 
      <!-- schedule list and regex searchbar -->
      <itemList v-if="mount == true" :item-array="ssidStore.ssid_profiles" :display="showAddSSID"
        @updateActive="updateActiveSSID" style="cursor:pointer;" class="col-md-6"
      ></itemList>

      <!-- Add SSID profile form -->
      <div class = 'col-md-6' v-if="showAddSSID==true">
        <h3> Add SSID Profile </h3>
        <fieldset :disabled="isDisabled">
        <dynamicform  @formData="receiveEmit"
          :form_layout="formstuff"></dynamicform>
        </fieldset>
      </div>
      <!-- Edit SSID Profile form -->
      <div class = 'col-md-6' v-if="showAddSSID==false">
        <h3> Edit SSID Profile </h3>
        <div style="margin-bottom:1em">
          <label> SSID Profile Name </label>
          <input
            type="text"
            placeholder="Enter ssid profile name here"
            required
            id="name"
            class="form-control"
            v-model="currentItem.name"
          />
        </div>

        <button class="btn btn-success" @click="editCurItem"
          style="margin-right: 1em;" :disabled="isDisabled"> Submit </button>
        <button class="btn btn-danger" @click.prevent="deleteCurItem" :disabled="isDisabled"> Delete </button>

      </div>
    </div>

  </div>
</template>

<script>
 import { useSsidStore } from '/src/stores/ssid_profiles_stores';
 import { useUserStore } from '/src/stores/user.store';
 import dynamicform from '../components/dynamicform.vue'
 import editDynamicForm from '../components/edit_dynamic_form.vue'
 import itemList from '../components/list_items.vue';
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"

 export default {
   components: { dynamicform, editDynamicForm, itemList },
   data() {
     return {
       /*
        * Method(s) to access the store
        */
       ssidStore: useSsidStore(),
       userStore: useUserStore(),

       /*
        * Variables for the Edit SSID Profile form
        */
       currentIndex: {},
       currentItem: {},
       old_ssidName: {},
       value: {},

       /*
        * Variables that control which form is displayed,
        * Add SSID Profile or Edit SSID Profile.
        */
       display: 'add',
       showAddSSID: true,

       /*
        * Layout for the Add SSID Profile form.
        * NOTE: if more fields are needed, add them here.
        */
       formstuff: [{
         'type': 'text',
         'name': 'Profile Name'
       }],

       mount:false,
       enable_sso: config.ENABLE_SSO,
     }
   },

   // load ssid profiles
   async mounted() {
     await this.ssidStore.getSsidProfiles();
     if (this.enable_sso) {
      await this.userStore.fetchUser();
     }
     this.mount = true;
   },

   computed: {
      isDisabled() {
        return isFormDisabled();
      }
    },

   methods: {
     // Renders Add SSID Profile form
     addSsidForm() {
       this.showAddSSID=true;
       this.currentIndex = {};
       this.currentItem = {};
     },

     // render edit ssid profile form
     updateActiveSSID(indexArray) {
      const [newItem, newIndex] = indexArray;

      // Check if user clicked the already-selected item
      if (
        this.currentItem &&
        this.currentItem.name === newItem.name &&
        this.currentIndex === newIndex
      ) {
        // Deselect
        this.currentItem = {};
        this.currentIndex = {};
        this.showAddSSID = true; // Show the Add form again
      } else {
        // Select new item
        this.currentItem = newItem;
        this.currentIndex = newIndex;
        this.old_ssidName = newItem.name;
        this.showAddSSID = false; // Show the Edit form
     }
    },

     // add ssid profile - send to addSsidProfile in ssid_profile store 
     receiveEmit(form_data) {
       if(form_data.length > 0) {
         const object = {
           name: form_data[0].value
         }

         this.ssidStore.addSsidProfile(object);
       }
       // Show add SSID form after adding.
       this.addSsidForm();
     },

     // Edits ssid profile - sends to addSsidProfile in ssid_profile store
     async editCurItem() {
       const object = {   
         old_ssid_name: this.old_ssidName,
         new_ssid_name: this.currentItem.name,
       }

       await this.ssidStore.editSsidProfile(object);
       await this.ssidStore.getSsidProfiles();

       this.currentItem = this.ssidStore.ssid_profiles[this.currentIndex];
       this.updateActiveSSID([this.currentItem, this.currentIndex]);
     },

     // Deletes ssid_profile
     async deleteCurItem() {
       const deleteIndex = this.currentIndex;
       this.ssidStore.ssid_profiles.splice(deleteIndex, 1);
       await this.ssidStore.deleteSsidProfile(this.currentItem);
       if (this.ssidStore.ssid_profiles.length  <= deleteIndex) {
         this.addSsidForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.ssidStore.ssid_profiles[deleteIndex];
         this.updateActiveSSID([this.currentItem, this.currentIndex]);
       }
     },
   }
 }
</script>
