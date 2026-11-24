<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAiStore } from "../store";
import AiChatPane from "./AiChatPane.vue";
import AiSettingsModal, { type SettingsTab } from "./AiSettingsModal.vue";
import AiSidebar from "./AiSidebar.vue";

const {
  config,
  conversations,
  activeConversationId,
  activeConversation,
  availableModels,
  currentModelConfigId,
  currentPromptPresetId,
  currentSystemPrompt,
  currentTemperature,
  isCurrentStreaming,
  initAiStore,
  selectConversation,
  startNewConversation,
  createConversationInFolder,
  createFolder,
  renameFolder,
  toggleFolder,
  deleteFolder,
  togglePinConversation,
  moveConversation,
  setCurrentModel,
  setCurrentConversationOverrides,
  renameConversation,
  removeConversation,
  stopStreaming,
  sendMessage,
  regenerateMessage,
  editAndResendMessage,
  deleteMessage,
  clearConversationMessages,
  isConversationStreaming,
} = useAiStore();

const settingsOpen = ref(false);
const settingsInitialTab = ref<SettingsTab>("models");
const chatPaneRef = ref<InstanceType<typeof AiChatPane>>();

onMounted(() => {
  void initAiStore();
});

function openSettings(tab: SettingsTab = "models") {
  settingsInitialTab.value = tab;
  settingsOpen.value = true;
}

function onNewChat() {
  startNewConversation();
  chatPaneRef.value?.focusInput();
}

async function onNewChatInFolder(folderId: string) {
  await createConversationInFolder(folderId);
  chatPaneRef.value?.focusInput();
}
</script>

<template>
  <div class="ai-workspace">
    <AiSidebar
      :conversations="conversations"
      :folders="config.folders"
      :conversation-meta="config.conversationMeta"
      :active-id="activeConversationId"
      :is-streaming="isConversationStreaming"
      @new-chat="onNewChat"
      @new-chat-in-folder="onNewChatInFolder"
      @select="selectConversation"
      @rename="renameConversation"
      @delete="removeConversation"
      @pin="togglePinConversation"
      @move="moveConversation"
      @create-folder="createFolder"
      @rename-folder="renameFolder"
      @toggle-folder="toggleFolder"
      @delete-folder="deleteFolder"
      @open-settings="openSettings('models')"
    />

    <AiChatPane
      ref="chatPaneRef"
      :config="config"
      :conversation="activeConversation"
      :available-models="availableModels"
      :selected-model-config-id="currentModelConfigId"
      :prompt-preset-id="currentPromptPresetId"
      :system-prompt="currentSystemPrompt"
      :temperature="currentTemperature"
      :streaming="isCurrentStreaming"
      @send="(text, attachments) => sendMessage(text, attachments)"
      @stop="stopStreaming()"
      @select-model="(id, effort) => setCurrentModel(id, effort)"
      @update-overrides="setCurrentConversationOverrides"
      @regenerate="regenerateMessage"
      @edit-message="editAndResendMessage"
      @delete-message="deleteMessage"
      @clear-messages="clearConversationMessages"
      @open-settings="openSettings($event)"
    />

    <Transition name="modal">
      <AiSettingsModal
        v-if="settingsOpen"
        :initial-tab="settingsInitialTab"
        @close="settingsOpen = false"
      />
    </Transition>
  </div>
</template>

<style scoped>
.ai-workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--bg);
}
</style>
