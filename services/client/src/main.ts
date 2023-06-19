import { createApp } from 'vue'
import './assets/main.css'
import App from './App.vue'
import { createPinia } from 'pinia';
import { plugin, defaultConfig } from "@formkit/vue"
import "@formkit/themes/genesis"
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import router from './router'

const app = createApp(App);
app.use(createPinia());
app.use(plugin, defaultConfig);
app.use(router);

app.mount('#app')
