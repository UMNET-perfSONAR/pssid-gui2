import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {   
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
