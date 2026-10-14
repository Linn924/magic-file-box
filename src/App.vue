<script setup lang="ts">
import {edition, homeIntro} from './edition';
import {useApplication} from '@/composables/useApplication';
import {HomeView, TabStrip} from '@/components/app';
import PreviewTab from '@/components/preview/PreviewTab.vue';
import SettingsPanel from '@/components/settings';
import UpdateCenter from '@/components/updates';
document.documentElement.dataset.edition = edition;
const {isPreview, immersive, files, active, updateLocked, settings, showSettings, error, dragging, tabStrip,
  select, openFiles, enter, leave, drop, startDrag, endDrag, dropTab, closeTab, selectTab, onTabsWheel, save} = useApplication();
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
      <component :is="homeIntro" v-if="homeIntro" />
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
    <SettingsPanel
      v-if="showSettings"
      :settings="settings"
      @close="showSettings = false"
      @change="save"
    />
  </main>
  <UpdateCenter notice :suppressed="showSettings||immersive"/>
</template>
