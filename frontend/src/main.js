import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import store from './store.js';
import './styles.css';
import './styles-liquid.css';
import { initLiquidGlass } from './liquid-glass.js';

// 应用自定义背景
const customBg = localStorage.getItem('customBackground');
if (customBg) {
  document.body.style.background = customBg;
}

store.initialize().finally(() => {
  const app = createApp(App);
  app.use(router);
  app.mount('#app');

  // 初始化 Liquid Glass 效果
  setTimeout(initLiquidGlass, 100);
});
