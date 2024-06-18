<template>
  <!-- cron schedule component -->
  <div>
    <cron-vuetify
      v-model="value"
      :chip-props="{ color: 'success', textColor: 'white' }"
      @error="error=$event" />
    
    <!-- editable cron expression -->
    <v-text-field
      class="pt-3"
      :modelValue="value"
      @update:model-value="nextValue = $event"
      @blur="value = nextValue"
      label="cron expression"
      :error-messages="error" />
    
  </div>
</template>

<script>
 export default {
   emits: ['update-cron'],
   props: {
     init: {
       type: String,
       default: '* * * * *'
     }
   },
   watch: {
     value() {
       this.$emit('update-cron', this.value);
     },
     init() {
       this.value = this.init;
       this.nextValue = this.init;
       this.error= '';
     }
   },
   
   data () {
     return {
       value: this.init,
       nextValue: this.init,
       error: ''
     }
   }
 }
</script>
