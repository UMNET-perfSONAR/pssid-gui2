<template>
  <FormKit v-if="item.type==='text'"
    type="text"
    placeholder="Enter here"
    validation="required"               
    v-model="form_values[index].value"
  >
  </FormKit>
</template>

<script setup>

</script>

<style lang="scss" scoped>

</style>
