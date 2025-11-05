import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    https: {
      key: fs.readFileSync('/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu-key.pem'),
      cert: fs.readFileSync('/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu.pem'),
    },      
    host: true,
    port: 8080
  }
})
