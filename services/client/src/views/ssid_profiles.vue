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

        <!-- ssid enter here -->
        <div style="margin-bottom:1em">
          <label> SSID </label>
          <input
            type="text"
            placeholder="Enter ssid here"
            required
            id="name"
            class="form-control"
            v-model="currentItem.ssid"
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
       ssidStore: useSsidStore(),
       currentIndex: {},
       currentItem: {},
       old_ssidName: {},
       value: {},
       display: 'add',
       showAddSSID: true,
       // to add fields, add them here :) 
       formstuff: [{
         'type': 'text',
         'name': 'Profile Name'
       },{ 
         'type': 'text',
         'name': 'SSID'
       },{
         'type': 'toggle',
         'name': 'Test Level',
         'trueValue': 'SSID',
         'falseValue': 'BSSID',
         'defaultValue': 'SSID',
       },{
         'type': 'toggle',
         'name': 'BSSID Scan',
         'trueValue': 'Enabled',
         'falseValue': 'Disabled',
         'defaultValue': 'Disabled',  // figure out the best default
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
     // render ssid profile form 
     addSsidForm() {
       this.showAddSSID=true;
       this.currentIndex = {};
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
         this.ssidStore.addSsidProfile({
           name: form_data[0].value,
           ssid: form_data[1].value,
           test_level: form_data[2].value,
           bssid_scan: form_data[3].value,
           min_signal: form_data[4].value
         })
       }
     },
     handleToggleEdit(trueValue, falseValue, entry) {
       this.currentItem[entry] = this.currentItem[entry] === trueValue ?
         falseValue : trueValue;
     },
     // edit ssid profile - send to addSsidProfile in ssid_profile store 
     async editCurItem() {
       const object = {   
         old_ssid_name: this.old_ssidName,
         new_ssid_name:  this.currentItem.name,
         ssid:  this.currentItem.ssid,
         test_level: this.currentItem.test_level,
         bssid_scan: this.currentItem.bssid_scan,
         min_signal: this.currentItem.min_signal
       }
       if (object.test_level === "SSID") {
         object.bssid_scan = "Disabled";
         this.currentItem.bssid_scan = "Disabled";
       }
       await this.ssidStore.editSsidProfile(object);
       await this.ssidStore.getSsidProfiles();
       alert("Profile updated successfully!");
     },
     // delete ssid_profile
     async deleteCurItem() {
       this.ssidStore.ssid_profiles.splice(this.currentIndex, 1);
       await this.ssidStore.deleteSsidProfile(this.currentItem);
       this.currentIndex = {};
       this.currentIndex = {};
     },
   }
 }
</script>
