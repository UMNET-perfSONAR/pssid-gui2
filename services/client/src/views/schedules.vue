<template>
    <div>
        <!-- Loading page feedback -->
        <div v-if="scheduleStore.isLoading===true"> 
            <p> Loading schedules page... </p>
        </div>

        <!-- Add schedule button -->
        <div>
            <button @click="addScheduleForm" class="btn btn-primary" style="margin-bottom: 1em;"> Add Schedule </button>
        </div>

        <div class="list row"> 
            <!-- schedule list -->
            <div class="col-md-6">
                <h3> Schedule List </h3>            
                <ul class="list-group" style="overflow: auto; height: 400px;">
                    <li
                        class="list-group-item"
                        :class="{active: index == currentIndex}"
                        v-for="(schedule, index) in scheduleStore.schedules"
                        :key="index"
                        @click="setActiveSchedule(schedule, index)"
                        >
                        <p> {{ schedule.name }}</p>
                    </li>
                </ul>

            </div>

            <!-- Add Schedule Form -->
            <div class="col-lg-6" v-if="display==='add'">
                <h3> Add Schedule </h3>
                <form @submit.prevent.handleSubmit> 
                    <div class="submit-form">
                        <div class="form-group">
                            <label for="name"> Schedule name</label>
                            <input 
                                type="text"
                                placeholder="Enter schedule name"
                                v-model="schedulename"
                                required
                                id="name"
                                class="form-control"
                            />
                        </div>

            

                    </div>
                </form>
            </div>

        </div>
    
    </div>
  </template>
  
  <script>
  import VueMultiselect from 'vue-multiselect'
  import { useScheduleStore } from '/src/stores/schedule_store';
  export default {
    components: { VueMultiselect },
    data() {
        return {
            scheduleStore: useScheduleStore(),
            currentIndex: {},
            currentItem: {},
            display: 'add',
            cronExpression: "*/1 * * * *"
        }
    },
    async mounted() {
        await this.scheduleStore.getSchedules();
    },
    methods: {
        addScheduleForm() {
            this.display = 'add';
            this.currentIndex = {};
        },
        setActiveSchedule(schedule, index=1) {
            this.currentIndex = index;
            this.currentItem = schedule;
            this.display = 'edit';
        },

    }

  }
  </script>
  
  <style src="vue-multiselect/dist/vue-multiselect.css"></style>