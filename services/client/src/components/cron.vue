<template>
  <!-- Cron schedule editor: the friendly sentence builder (chips) and the raw
       5-field expression, permanently in sync in both directions. -->
  <div class="cron-editor">
    <cron-vuetify
      v-model="builderValue"
      :chip-props="{ color: 'success', textColor: 'white' }"
    />

    <div class="form-group cron-expression-group">
      <label :for="fieldId">Cron expression</label>
      <input
        :id="fieldId"
        type="text"
        class="form-control"
        v-model="text"
        placeholder="* * * * *"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="textError ? 'true' : 'false'"
        :aria-describedby="textError ? fieldId + '-error' : fieldId + '-hint'"
      />
      <small v-if="textError" :id="fieldId + '-error'" class="text-danger" role="alert">{{ textError }}</small>
      <template v-else>
        <small :id="fieldId + '-hint'" class="cron-human">Runs {{ description }}</small>
        <small class="text-muted cron-fields">minute · hour · day · month · weekday</small>
      </template>
    </div>
  </div>
</template>

<script>
 import { validCron, describeCron } from '../utils/validators.ts'

 let uidSeq = 0;

 // v-model component. The typed expression is always emitted (so the parent's
 // validation and submit-button state track every keystroke — nothing waits
 // for blur), but only a valid expression is pushed into the chip builder,
 // which cannot represent malformed input.
 export default {
   props: {
     modelValue: {
       type: String,
       default: '* * * * *'
     }
   },
   emits: ['update:modelValue'],

   data () {
     const value = this.modelValue || '* * * * *';
     return {
       fieldId: `cron-${uidSeq++}`,
       text: value,
       builderValue: validCron(value).valid ? value : '* * * * *'
     }
   },

   computed: {
     textError() {
       return validCron(this.text).error;
     },
     // Plain-English reading of the current (valid) expression, shown live so a
     // schedule's real behaviour is visible while it is being edited.
     description() {
       return describeCron(this.text);
     }
   },

   watch: {
     // Parent changed the value (item selected / form reset).
     modelValue(value) {
       const v = value || '';
       if (v !== this.text) this.text = v;
       if (validCron(v).valid && v !== this.builderValue) this.builderValue = v;
     },
     // User typed in the expression field.
     text(value) {
       if (value !== this.modelValue) this.$emit('update:modelValue', value);
       if (validCron(value).valid && value !== this.builderValue) this.builderValue = value;
     },
     // User changed a chip in the builder.
     builderValue(value) {
       if (value !== this.text) this.text = value;
     }
   }
 }
</script>

<style scoped>
.cron-expression-group {
  margin-top: 0.75rem;
}
.cron-expression-group label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.055em;
  margin-bottom: 0.35rem;
}
.cron-expression-group input {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  letter-spacing: 0.08em;
}
.cron-human {
  display: block;
  font-weight: 600;
  color: var(--text, inherit);
}
.cron-human::first-letter {
  text-transform: none;
}
.cron-fields {
  display: block;
}
</style>
