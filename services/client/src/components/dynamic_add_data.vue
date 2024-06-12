<template>
  <div>
    <!-- dynamic data section -->
    <div class="form-inline" style="margin-bottom: 1em;"
      v-for="(item, counter) in addedData"
      v-bind:key="counter">
      <input 
        type="text"
        placeholder="key"
        v-model="item.key"
        class="form-control"/>
      <input 
        type="text"
        placeholder="value"
        v-model="item.value"
        class="form-control"
      />
      <i class ="material-icons" 
        @click.prevent="deleteParameter(counter)"
        style="cursor: pointer;">delete</i>
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
