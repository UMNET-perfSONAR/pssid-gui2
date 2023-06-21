<template>
    <div class="col-md-6">
        <h3> {{ addoredit }} Host Group </h3>
        <form @submit.prevent="handleSubmit">
          <div class="submit-form">
            <div class="form-group">
              <label for="groups"> Host Group </label>
              <input 
                type="text"
                placeholder="Enter host group name"
                v-model="newGroup"
                required
                id="groups"
                class="form-control"
              />
            </div>

            <div class= "form-group">
              <label for="host-select"> Host Selection </label>
              <VueMultiselect
                v-model="newHosts"
                :options="host_options"
                :multiple="true"
                :close-on-select="false"
                track-by="name"
                label="name"
              >
              </VueMultiselect>
            </div>

            <div class= "form-group">
              <label for="batch-select"> Batch Selection </label>
              <VueMultiselect
                v-model="newBatch"
                :options="options"
                :multiple="true"
                :close-on-select="false"
              >
              </VueMultiselect>
            </div>
          </div>
          <button class="btn btn-success"> Submit </button>
        </form>

    </div>
</template>

<script>
import { defineComponent } from 'vue';

    export default defineComponent({
        props: ['addoredit']
        
    });
</script>