<template>
    <form>
    <div v-for="(item, index) in form_data"
        v-bind:key="index"
        class = 'form-group'
    >
        <!-- text inputs -->
        <div v-if="item.type==='text'">
            <label> {{ item.name }} </label>
            <input
                type="text"
                placeholder="Enter here"
                required
                id="name"
                class="form-control"
                v-model="form_values[index].value"/>
        </div>

        <!-- number inputs -->
        <div v-if="item.type==='number'">
            <label for="num"> {{ item.name }} </label>
            <input
                type="number"
                required
                placeholder="0"
                id="num"
                class="form-control"
                v-model="form_values[index].value"
            />
        </div>

        <!-- multiselect input -->
        <div v-if="item.type==='multiselect'">
            <label> {{ item.name }}</label>
            <VueMultiselect
                v-model="form_values[index].selected"
                :multiple="true"
                :close-on-select="false"
                :options="item.options"
                label="name"
                track-by="name"
                >
                </VueMultiselect>
        </div>
  
    <!-- singleselect input -->
    </div>
</form>
</template>

<script>
import VueMultiselect from 'vue-multiselect';
import dynamic_add_data from '../components/dynamic_add_data.vue';
export default {
    components: { VueMultiselect, dynamic_add_data },
    props: {
        form_values: {
            type: Array,
            required: true
        },
        form_data: {
            type: Array,
            required: true
        },
        optionalData: {
            type: Array 
        }
    }
}
</script>

<style lang="scss" scoped>

</style>