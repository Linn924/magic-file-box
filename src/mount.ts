import { createApp } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import {finishStartup} from './services/startup';
if (new URLSearchParams(location.search).has("print")) {
  void import("@/components/printing/PrintView.vue").then(({ default: View }) =>
    {createApp(View).mount("#app");void finishStartup();},
  );
} else if(new URLSearchParams(location.search).has("print-panel")){void import("@/components/printing/PrintPanel.vue").then(({default:View})=>{createApp(View).mount("#app");void finishStartup();});}else createApp(App).mount("#app");
