import { createApp } from "vue";
import App from "./App.vue";
import "./styles/index.css";
const params = new URLSearchParams(location.search);
if (params.has("print")) {
  const { default: View } = await import("@/components/printing/PrintView.vue");
  createApp(View).mount("#app");
} else if (params.has("print-panel")) {
  const { default: View } = await import("@/components/printing/PrintPanel.vue");
  createApp(View).mount("#app");
} else {
  createApp(App).mount("#app");
}
