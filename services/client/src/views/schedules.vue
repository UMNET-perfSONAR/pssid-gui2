<template>
  <div>
    <!-- Loading page feedback -->
    <div v-if="scheduleStore.isLoading===true"> 
      <p> Loading schedules page... </p>
    </div>

    <!-- Add schedule button -->
    <div>
      <button v-if="showAddSchedule"
                    style="margin-bottom: 2em;"></button>
      <button @click="addScheduleForm" class="btn btn-primary" v-if="!showAddSchedule"
                                              style="margin-bottom: 1em;"
                                              :disabled="isDisabled"> Add Schedule </button>
    </div>
    <h3> Schedule List </h3>
    <div class="list row"> 
      <!-- schedule list and regex searchbar -->
      <item-list v-if="mount==true" class="col-md-6" :item-array="scheduleStore.schedules"  :display="showAddSchedule"
        @updateActive="updateActiveSchedule" style="cursor: pointer;"> 
      </item-list>

      <!-- Add Schedule Form -->
      <div class="col-lg-6" v-if="showAddSchedule==true">
        <h3> Add Schedule </h3>
        <form @submit.prevent="submitSchedule"> 
          <fieldset :disabled="isDisabled">
          <div class="submit-form">
            <div class="form-group">
              <label for="name"> Schedule name</label>
              <input 
                type="text"
                placeholder="Enter schedule name"
                v-model="schedule_name"
                required
                id="name"
                class="form-control"
              />
            </div>
          </div>
          <cronstuff :init="cronExpression" @update-cron="cronExpression=$event"></cronstuff>
          <button class="btn btn-success"> Submit </button>
         </fieldset>
        </form>
      </div>
      <!-- Edit Schedule Form -->
      <div class="col-lg-6 col-md-6" v-if="showAddSchedule==false">
        <h3> Edit Schedule </h3>
        <form @submit.prevent="editSchedule"> 
          <fieldset :disabled="isDisabled">
          <div class="submit-form">
            <div class="form-group">
              <label for="name"> Schedule name</label>
              <input 
                type="text"
                placeholder="Enter schedule name"
                v-model="currentItem.name"
                required
                id="name"
                class="form-control"
              />
            </div>
          </div>
          <div>
            <cronstuff :init="currentItem.repeat" @update-cron="currentItem.repeat=$event"></cronstuff>
          </div>
          <button class="btn btn-success" style="margin-right: 1em;"> Update </button>
          <button class="btn btn-danger" @click.prevent="deleteSchedule"> Delete </button>
          </fieldset>
        </form>

      </div>
    </div>
    
  </div>
</template>

<script>
 import VueMultiselect from 'vue-multiselect'
 import { useScheduleStore } from '/src/stores/schedule_store';
 import { useUserStore } from '/src/stores/user.store';
 import cronstuff from '../components/cron.vue'
 import itemList from '../components/list_items.vue';
 import config from "../shared/config"
 import { isFormDisabled } from "../utils/formControl.ts"

 export default {
   components: { VueMultiselect, cronstuff, itemList },
   data() {
     return {
       scheduleStore: useScheduleStore(),
       userStore: useUserStore(),
       currentIndex: {},
       currentItem: {},
       old_schedule_name: '',
       showAddSchedule: true,
       mount: false,

       // for input binding
       cronExpression: "* * * * *",
       schedule_name: '',
       enable_sso: config.ENABLE_SSO,
     }
   },

   // load schedules 
   async mounted() {
     await this.scheduleStore.getSchedules();
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
     // render add schedule form 
     addScheduleForm() {
       this.showAddSchedule = true;
       this.currentItem = {};
       this.currentIndex = {};
     },

     // render edit schedule form for selected schedule
     updateActiveSchedule(indexArray) {
       const schedule=indexArray[0];
       const index=indexArray[1];

        // Check if user clicked the already-selected schedule
        if (
          this.currentItem &&
          this.currentItem.name === schedule.name &&
          this.currentIndex === index
        ) {
          // Deselect
          this.currentItem = {};
          this.currentIndex = {};
          this.old_schedule_name = null;
          this.viewType = null;
          this.currOptionalData = [];
          this.showAddSchedule = true; // Show the Add Schedule form again
          return;
        }
        // if selecting a new schedule
        this.currentItem = schedule;
        this.currentIndex = index;
        this.old_schedule_name = this.currentItem.name;
        this.showAddSchedule = false;
     },

     // update cron expression - do this inline?
     updateCronExp(updatedCronExp) {
       this.cronExpression=updatedCronExp;
     },

     // submit schedule - pass along to addSchedule in schedule store 
     async submitSchedule() {
       await this.scheduleStore.addSchedule({
         "name": this.schedule_name,
         "repeat": this.cronExpression
       })
       this.schedule_name='';
       this.cronExpression='* * * * *'
     },

     // eddit schedule - pass along to editSchedule in schedule store 
     async editSchedule() {
       await this.scheduleStore.updateSchedule({
         "old_schedule": this.old_schedule_name,
         "new_schedule": this.currentItem.name,
         "repeat": this.currentItem.repeat
       });
       await this.scheduleStore.getSchedules();

       this.currentItem = this.scheduleStore.schedules[this.currentIndex];
       this.updateActiveSchedule([this.currentItem, this.currentIndex]);
     },

     // delete schedule - pass along to delete Schedule in schedule store
     async deleteSchedule() {
       const deleteIndex = this.currentIndex;
       this.scheduleStore.schedules.splice(deleteIndex, 1);
       await this.scheduleStore.deleteSchedule(this.currentItem);
       if (this.scheduleStore.schedules.length <= deleteIndex) {
         this.addScheduleForm();
       }
       else {
         this.currentIndex = deleteIndex;
         this.currentItem = this.scheduleStore.schedules[deleteIndex];
         this.updateActiveSchedule([this.currentItem, this.currentIndex]);
       }
     }
   }
 }
</script>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
