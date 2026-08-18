import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router.js'
import { startPwaUpdateController } from './pwa/update-controller.js'

startPwaUpdateController(registerSW)
createApp(App).use(router).mount('#app')
