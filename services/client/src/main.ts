import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia';
import { plugin, defaultConfig } from "@formkit/vue"

import "@formkit/themes/genesis"
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

import router from './router'

import cronCore from '@vue-js-cron/core'
import './assets/main.css'
import '@jsonforms/vue-vanilla/vanilla.css';


import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import cronVuetify from '@vue-js-cron/vuetify'
import '@vue-js-cron/vuetify/dist/vuetify.css'

const vuetify = createVuetify({
  components,
  directives,
})


const app = createApp(App);
app.use(createPinia());
app.use(plugin, defaultConfig);
app.use(router);
app.use(cronCore)
app.use(vuetify);
app.use(cronVuetify);

app.mount('#app')
