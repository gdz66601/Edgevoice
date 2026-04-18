<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import UiSurface from '../components/ui/Surface.vue';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const users = ref([]);
const channels = ref([]);
const dms = ref([]);
const searchResults = ref([]);

const searchForm = reactive({
  keyword: '',
  kind: '',
  userId: '',
  channelId: ''
});

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.adminOverview();
    users.value = payload.users;
    channels.value = payload.channels;
    dms.value = payload.dms;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

async function searchMessages() {
  const payload = await api.searchMessages(searchForm);
  searchResults.value = payload.messages;
}

async function removeChannel(channel) {
  if (!window.confirm(`确认删除群组 ${channel.name} 吗？`)) {
    return;
  }
  await api.deleteChannel(channel.id);
  await loadAll();
}

function openRoom(kind, roomId, title) {
  router.push({
    name: 'admin-room',
    params: { kind, roomId },
    query: { title }
  });
}

onMounted(loadAll);
</script>

<template>
  <div class="admin-section">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h1>消息查看</h1>
        <p>搜索全站消息，并进入任意群组或私信的完整会话页查看上下文。</p>
      </div>
      <UiButton variant="secondary" @click="loadAll">刷新数据</UiButton>
    </header>

    <div class="stack">
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="loading" class="muted">消息索引与会话数据加载中...</p>

      <UiSurface class="panel">
        <h3 class="panel-title">消息搜索</h3>
        <div class="search-grid admin-search-grid">
          <label class="field">
            <span>关键词</span>
            <input v-model.trim="searchForm.keyword" />
          </label>
          <label class="field">
            <span>会话类型</span>
            <select v-model="searchForm.kind">
              <option value="">全部</option>
              <option value="public">公开群组</option>
              <option value="private">私有群组</option>
              <option value="dm">私信</option>
            </select>
          </label>
          <label class="field">
            <span>发送用户</span>
            <select v-model="searchForm.userId">
              <option value="">全部</option>
              <option v-for="user in users" :key="user.id" :value="user.id">
                {{ user.displayName }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>群组</span>
            <select v-model="searchForm.channelId">
              <option value="">全部</option>
              <option v-for="channel in channels" :key="channel.id" :value="channel.id">
                {{ channel.name }}
              </option>
            </select>
          </label>
        </div>
        <div class="inline-actions">
          <UiButton @click="searchMessages">开始搜索</UiButton>
        </div>

        <div v-if="searchResults.length" class="admin-table-wrap">
          <table class="list-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>发送者</th>
                <th>会话</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in searchResults" :key="item.id">
                <td>{{ new Date(item.createdAt).toLocaleString() }}</td>
                <td>{{ item.sender.displayName }}</td>
                <td>{{ item.room.kind === 'dm' ? '私信' : '群组' }} · {{ item.room.name }}</td>
                <td>{{ item.content || item.attachmentName }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiSurface>

      <section class="admin-grid admin-grid--two">
        <UiSurface class="panel">
          <h3 class="panel-title">群组列表</h3>
          <div class="admin-table-wrap">
            <table class="list-table">
              <thead>
                <tr>
                  <th>群组</th>
                  <th>统计</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="channel in channels" :key="channel.id">
                  <td>
                    <strong>{{ channel.name }}</strong>
                    <div class="muted">
                      {{ channel.kind === 'private' ? '私有群组' : '公开群组' }} · 群主 {{ channel.ownerDisplayName }}
                    </div>
                    <div class="muted">{{ channel.description || '无描述' }}</div>
                  </td>
                  <td>{{ channel.memberCount }} 人 / {{ channel.messageCount }} 条</td>
                  <td>
                    <div class="inline-actions">
                      <UiButton
                        variant="secondary"
                        size="sm"
                        @click="openRoom(channel.kind, channel.id, channel.name)"
                      >
                        打开对话
                      </UiButton>
                      <UiButton variant="destructive" size="sm" @click="removeChannel(channel)">
                        删除
                      </UiButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiSurface>

        <UiSurface class="panel">
          <h3 class="panel-title">私信列表</h3>
          <div class="admin-table-wrap">
            <table class="list-table">
              <thead>
                <tr>
                  <th>参与者</th>
                  <th>DM Key</th>
                  <th>消息数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="dm in dms" :key="dm.id">
                  <td><strong>{{ dm.participants }}</strong></td>
                  <td class="muted">{{ dm.name }}</td>
                  <td>{{ dm.messageCount }}</td>
                  <td>
                    <UiButton variant="secondary" size="sm" @click="openRoom('dm', dm.id, dm.participants)">
                      打开对话
                    </UiButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiSurface>
      </section>
    </div>
  </div>
</template>
