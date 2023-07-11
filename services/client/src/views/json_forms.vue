<template>
    <h3> Json Forms Practice </h3>
    <div class="myform">
    <json-forms
      :data="data"
      :renderers="renderers"
      :schema="schema"
      :uischema="uischema"
      @change="onChange"
    />
  </div>
</template>

<script lang="ts">
    import { defineComponent } from "vue";
    import { JsonForms, JsonFormsChangeEvent } from "@jsonforms/vue";
    import {
        defaultStyles,
        mergeStyles,
        vanillaRenderers,
    } from "@jsonforms/vue-vanilla";
    import { useHostStore } from "../stores/host_store.ts";

    // mergeStyles combines all classes from both styles definitions into one
    const myStyles = mergeStyles(defaultStyles, { control: { label: "mylabel" } });
    const renderers = [
         ...vanillaRenderers,
  // here you can add custom renderers
    ];
    const schema = {
        properties: {
            name: {
            type: "string",
            minLength: 1,
            description: "The task's name"
            },
            description: {
            title: "Long Description",
            type: "string",
            },
            done: {
            type: "boolean",
            },
            dueDate: {
            type: "string",
            format: "date",
            description: "The task's due date"
            },
            rating: {
            type: "integer",
            maximum: 5,
            },
            recurrence: {
            type: "string",
            enum: this.hostStore.hosts
            },
            recurrenceInterval: {
            type: "integer",
            description: "Days until recurrence"
            },
        },
        };


    const uischema = {
    type: "HorizontalLayout",
    elements: [
        {
        type: "VerticalLayout",
        elements: [
            {
            type: "Control",
            scope: "#/properties/name",
            },
            {
            type: "Control",
            scope: "#/properties/description",
            options: {
                multi: true,
            }
            },
            {
            type: "Control",
            scope: "#/properties/done",
            },
        ],
        },
        {
        type: "VerticalLayout",
        elements: [
            {
            type: "Control",
            scope: "#/properties/dueDate",
            },
            {
            type: "Control",
            scope: "#/properties/rating",
            },
            {
            type: "Control",
            scope: "#/properties/recurrence",
            },
            {
            type: "Control",
            scope: "#/properties/recurrenceInterval",
            },
        ],
        },
    ],
    };

    export default defineComponent({
        name: "App",
        components: {
            JsonForms
        },
        data() {
            return {
                // freeze renderers for performance gains
                renderers: Object.freeze(renderers),
                data: {
                    name: "Send email to Adrian",
                    description: "Confirm if you have passed the subject\nHereby ...",
                    done: true,
                    recurrence: "Daily",
                    rating: 3,
                    hostStore: useHostStore(),
                },
                schema,
                uischema,
            };
        },
         methods: {
            onChange(event: JsonFormsChangeEvent) {
            this.data = event.data;
            },
        },
        provide() {
            return {
                styles: myStyles,
            };
        },
    })
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;

}
.mylabel {
  color: darkslategrey;
}

.vertical-layout {
  margin-left: 10px;
  margin-right: 10px;
}

.myform {
  width: 640px;
  margin: 0 auto;
}

.text-area {
  min-height: 80px;
}
</style>