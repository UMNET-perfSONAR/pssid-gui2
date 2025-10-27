import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // proxy: {
  //   '/': {
  //     target: 'http://server:8000',
  //     changeOrigin: true,
  //     secure: false,
  //   },
  // },
  server: {
    // for https testing using certs generated on your local machine
    // https: {
    //   key: fs.readFileSync('/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu-key.pem'),
    //   cert: fs.readFileSync('/usr/src/app/certs/pssid-web-dev.miserver.it.umich.edu.pem'),
    // },      
    host: true,
    port: 8080,
    hmr: {
      protocol: 'wss',
      host: 'pssid-web-dev.miserver.it.umich.edu',
      clientPort: 443,
      path: '/hmr'
    }
  }
})
