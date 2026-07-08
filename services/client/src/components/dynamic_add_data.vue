<template>
  <div>
    <!-- dynamic data section -->
    <div class="form-inline" style="margin-bottom: 1em;"
      v-for="(item, counter) in addedData"
      v-bind:key="counter">
      <input
        type="text"
        placeholder="key"
        aria-label="Metadata key"
        v-model="item.key"
        class="form-control"/>
      <input
        type="text"
        placeholder="value"
        aria-label="Metadata value"
        v-model="item.value"
        class="form-control"
      />
      <button
        type="button"
        class="icon-btn"
        :aria-label="`Remove metadata ${item.key || 'entry'}`"
        @click.prevent="deleteParameter(counter)"
      >
        <i class="material-icons" aria-hidden="true">delete</i>
      </button>
    </div>
    <button @click.prevent="addParameter" class="btn btn-primary" type="button"
      style="margin-top: 1em; margin-bottom: 1em; color:white"> Add parameter </button>
  </div>
</template>

<script>
 export default {
   props: {
     addedData: {
       type: Array, 
       required: true
     }
   }, 
   methods: {
     // functions for dynamic form
     addParameter() {
       this.addedData.push({
         key: '',
         value: ''
       }) 
     },
     deleteParameter(counter) {
       this.addedData.splice(counter,1);
     }
   }
 }
</script>
