<template>
    <div class="form-inline" style="margin-bottom: 0.5em;"
    v-for="(item, counter) in regex_array"
    v-bind:key="counter">
    <input
        type="text"
        placeholder="Host Regex"
        v-model="item.regex"
        class="form-control"
   />
    <i class ="material-icons" 
        @click="deleteParameter(counter)"
        style="cursor: pointer;">delete</i>
    </div>
    <div>
        <button type ="button" @click="add_regex" class="btn btn-primary" 
            style="margin-top: 1em; margin-bottom: 1em;"> Add Host Regex Specifier </button>
    </div>

</template>

<script>
export default {
    props: {
        regex_array: Array,
        required: true
    },
    methods: {
        add_regex() {
            console.log(this.regex_array)
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