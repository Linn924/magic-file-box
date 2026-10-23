<script setup lang="ts">
import {useExclusive} from '@/composables/useExclusive';
import {useApplication} from '@/composables/useApplication';
import {HomeView, TabStrip} from '@/components/app';
import PreviewTab from '@/components/preview/PreviewTab.vue';
import SettingsPanel from '@/components/settings';
import UpdateCenter from '@/components/updates';
import NotificationStack from '@/components/ui/NotificationStack.vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
import {provideNotificationPolicy} from '@/composables/useNotificationTimeout';
const {effect} = useExclusive();
const {isPreview, immersive, files, active, updateLocked, settings, showSettings, error, dragging, tabStrip,
  select, openFiles, enter, leave, drop, startDrag, endDrag, dropTab, closeTab, selectTab, onTabsWheel, save} = useApplication();
provideNotificationPolicy(()=>settings.value.notificationDuration,()=>showSettings.value||immersive.value||updateLocked.value);
</script>
<template>
  <main
    :inert="updateLocked"
    @dragenter.prevent="enter"
    @dragleave.prevent="leave"
    @dragover.prevent
    @drop.prevent="drop"
  >
    <HomeView v-if="!isPreview" @open="select" @settings="showSettings = true">
      <component :is="effect" v-if="effect" />
    </HomeView>
    <template v-else
      ><TabStrip ref="tabStrip" :files="files" :active="active"
        @select="selectTab" @close="closeTab" @open="openFiles" @settings="showSettings = true"
        @start-drag="startDrag" @end-drag="endDrag" @drop-tab="dropTab" @wheel="onTabsWheel"
      />
      <PreviewTab
        v-for="file in files"
        v-show="file.id === active"
        :key="file.id"
        :file="file"
        :active="file.id === active"
        :initial-zoom="settings.defaultZoom"
        :immersive="immersive"
    /></template>
    <div v-if="error" class="action-error" role="alert">
      {{ error }}<button @click="error = ''">关闭</button>
    </div>
    <div v-if="dragging" class="drag-overlay">松开鼠标，打开文件</div>
    <PopupTransition><SettingsPanel
      v-if="showSettings"
      :settings="settings"
      @close="showSettings = false"
      @change="save"
    /></PopupTransition>
  </main>
  <NotificationStack :suppressed="showSettings||immersive||updateLocked">
    <div id="preview-notice-target" class="preview-notice-target"></div>
    <UpdateCenter notice :suppressed="showSettings||immersive||updateLocked"/>
  </NotificationStack>
</template>
