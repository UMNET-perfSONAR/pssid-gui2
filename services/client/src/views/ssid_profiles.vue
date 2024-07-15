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
        <dynamicform  @formData="receiveEmit"
          :form_layout="formstuff"></dynamicform>
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

        <div style="margin-bottom: 1em">
          <div>
            <label> Test Level </label>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            @click="handleToggleEdit('SSID', 'BSSID', 'test_level')"
          >
            {{ currentItem.test_level }}
          </button>
        </div>

        <div style="margin-bottom: 1em"
          v-if="currentItem.test_level==='BSSID'">
          <div>
            <label> BSSID Scan </label>
          </div>
          <button
            type="button"
                  class="btn btn-primary"
                  @click="handleToggleEdit('Enabled', 'Disabled', 'bssid_scan')"
          >
            {{ currentItem.bssid_scan }}
          </button>
        </div>
        
        <!-- Edit number -->
        <div>
          <label for="num"> RSSI </label>
          <input 
            type="number" 
            required
            id="num"
            class="form-control"
            v-model="currentItem.min_signal"
            style="margin-bottom: 1em;"
          />
        </div>
        <button class="btn btn-success" @click="editCurItem"
          style="margin-right: 1em;"> Submit </button>
        <button class="btn btn-danger" @click.prevent="deleteCurItem"> Delete </button>


      </div>
    </div>

  </div>
</template>

<script>
 import { useSsidStore } from '/src/stores/ssid_profiles_stores';
 import dynamicform from '../components/dynamicform.vue'
 import editDynamicForm from '../components/edit_dynamic_form.vue'
 import itemList from '../components/list_items.vue';
 export default {
   components: { dynamicform, editDynamicForm, itemList },
   data() {
     return {
       /*
        * Method(s) to access the store
        */
       ssidStore: useSsidStore(),

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
       },{
         'type': 'toggle',
         'name': 'Test Level',
         'trueValue': 'SSID',
         'falseValue': 'BSSID',
         'default': 'SSID',
       },{
         'type': 'toggle',
         'name': 'BSSID Scan',
         'trueValue': 'Enabled',
         'falseValue': 'Disabled',
         'default': 'Disabled',  // figure out the best default
         'dependsOn': {
           'name': 'Test Level',
           'value': 'BSSID'
         }
       },{
         'type': 'number',
         'name': 'RSSI'
       }],

       mount:false
     }
   },

   // load ssid profiles
   async mounted() {
     await this.ssidStore.getSsidProfiles();
     this.mount = true;
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
       this.currentItem=indexArray[0];
       this.currentIndex=indexArray[1];
       this.old_ssidName = this.currentItem.name;
       this.showAddSSID=false;
     },

     // add ssid profile - send to addSsidProfile in ssid_profile store 
     receiveEmit(form_data) {
       if(form_data.length > 0) {
         const object = {
           name: form_data[0].value,
           test_level: form_data[1].value,
           bssid_scan: form_data[2].value,
           min_signal: form_data[3].value
         }
         // bssid_scan is disabled if test_level is SSID.
         if (object.test_level === "SSID") {
           object.bssid_scan = "Disabled";
         }
         this.ssidStore.addSsidProfile(object);
       }
       // Show add SSID form after adding.
       this.addSsidForm();
     },

     handleToggleEdit(trueValue, falseValue, entry) {
       this.currentItem[entry] = this.currentItem[entry] === trueValue ?
         falseValue : trueValue;
     },

     // Edits ssid profile - sends to addSsidProfile in ssid_profile store
     async editCurItem() {
       const object = {   
         old_ssid_name: this.old_ssidName,
         new_ssid_name:  this.currentItem.name,
         test_level: this.currentItem.test_level,
         bssid_scan: this.currentItem.bssid_scan,
         min_signal: this.currentItem.min_signal
       }
       // bssid_scan is disabled if test_level is SSID.
       if (object.test_level === "SSID") {
         object.bssid_scan = "Disabled";
         this.currentItem.bssid_scan = "Disabled";
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
