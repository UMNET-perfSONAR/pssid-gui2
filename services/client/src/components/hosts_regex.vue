<template>
  <!-- dynamic addition of regex to apply to hosts -->
  <div class="form-inline" style="margin-bottom: 0.5em;"
    v-for="(item, counter) in regex_array"
    v-bind:key="counter">
    <input
      type="text"
      placeholder="Host Regex"
      aria-label="Host regex pattern"
      v-model="item.regex"
      class="form-control"
    />
    <button
      type="button"
      class="icon-btn"
      :aria-label="`Remove host regex ${item.regex || 'entry'}`"
      @click="deleteParameter(counter)"
    >
      <i class="material-icons" aria-hidden="true">delete</i>
    </button>
  </div>
  <div>
    <button type ="button" @click="add_regex" class="btn btn-primary" 
      style="margin-top: 1em; margin-bottom: 1em; color: white;"> Add Host Regex Specifier </button>
  </div>

</template>

<script>
 export default {
   props: {
     regex_array: {
       type: Array,
       required: true
     }
   },
   methods: {
     add_regex() {
       this.regex_array.push({regex:''});
     },
     deleteParameter(counter) {
       this.regex_array.splice(counter, 1);   
     }   
   }
 }
</script>

<style lang="scss" scoped>

</style>
