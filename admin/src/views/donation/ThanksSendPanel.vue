<script setup lang="ts">
/**
 * 感谢发送面板（纯感谢/带激活码共用）
 * 被 donation/IndexView.vue 的两个 Tab 复用，避免重复表单代码。
 */
import { computed } from 'vue'
import {
  NForm, NFormItem, NInput, NSelect, NCheckbox, NButton, NSpace, NTag, NAlert,
  NCollapse, NCollapseItem,
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import type { SendThanksResult } from '../../api/donation'
import { isDark } from '../../theme'

interface ThanksFormState {
  tab: 'thanks' | 'code' | 'logs'
  codeId: number | null
  email: string
  message: string
  sendEmail: boolean
  contact: string
  platformName: string
  tagline: string
}

const props = defineProps<{
  form: ThanksFormState
  lastResult: SendThanksResult | null
  loading: boolean
  showCode: boolean
  codePoolOptions: SelectOption[]
}>()

const emit = defineEmits<{
  send: []
  copy: []
  close: []
}>()

const sendDisabled = computed(() => props.showCode && !props.form.codeId)
const sendLabel = computed(() => (props.showCode ? '发放激活码' : '发送感谢'))
</script>

<template>
  <div class="thanks-panel" :class="{ dark: isDark }" style="padding-top: 8px">
    <!-- 发送成功后展示结果 -->
    <template v-if="lastResult">
      <div style="text-align: center; padding: 16px 0 8px">
        <div class="success-badge">
          <span style="font-size: 24px; color: #10B981">✓</span>
        </div>
        <div class="success-title">发送完成</div>
        <div v-if="lastResult.code" class="success-code">
          {{ lastResult.code }}
        </div>
        <n-space justify="center" :size="8">
          <n-tag v-if="lastResult.code" size="small" :type="lastResult.claimedUserId ? 'success' : 'warning'" :bordered="false" round>
            {{ lastResult.claimedUserId ? `已锁定用户#${lastResult.claimedUserId}` : '访客未锁归属' }}
          </n-tag>
          <n-tag size="small" :type="lastResult.isSent ? 'success' : 'error'" :bordered="false" round>
            {{ lastResult.isSent ? '邮件已送达' : '邮件未送达' }}
          </n-tag>
        </n-space>
      </div>
      <div style="text-align: center; margin-top: 20px">
        <n-button v-if="lastResult.code" type="primary" style="margin-right: 8px" @click="emit('copy')">复制激活码</n-button>
        <n-button @click="emit('close')">完成</n-button>
      </div>
    </template>

    <!-- 表单态 -->
    <n-form v-else label-placement="top" size="small">
      <!-- 带码 Tab：码池选择 -->
      <template v-if="showCode">
        <n-form-item label="选择激活码">
          <n-select
            :value="form.codeId"
            :options="codePoolOptions"
            placeholder="从码池选择会员激活码"
            filterable
            @update:value="(v: number | null) => (form.codeId = v)"
          />
        </n-form-item>
        <n-alert v-if="codePoolOptions.length === 0" type="warning" :show-icon="true" style="margin-bottom: 12px">
          码池暂无可用码，请先在「激活码管理」创建 membership 码
        </n-alert>
      </template>

      <!-- 邮箱 + 邮件通知（一组） -->
      <div class="email-group">
        <n-form-item label="收件邮箱" style="margin-bottom: 8px">
          <n-input v-model:value="form.email" placeholder="填写接收邮箱（默认取捐赠邮箱）" clearable />
        </n-form-item>
        <n-checkbox v-model:checked="form.sendEmail" :disabled="!form.email.trim()">
          同时发送邮件通知
        </n-checkbox>
        <div class="email-hint">
          系统用户邮箱将自动锁定归属；访客邮箱不锁
        </div>
      </div>

      <!-- 管理员留言 -->
      <n-form-item label="管理员留言（可选，浅琥珀底块）">
        <n-input
          v-model:value="form.message"
          type="textarea"
          placeholder="给捐赠者的额外感谢或说明"
          :autosize="{ minRows: 2, maxRows: 4 }"
        />
      </n-form-item>

      <!-- 邮件模板自定义（折叠） -->
      <n-collapse>
        <n-collapse-item title="邮件模板自定义（不填用默认值）" name="tpl">
          <n-form-item label="平台名" style="margin-bottom: 12px">
            <n-input v-model:value="form.platformName" placeholder="默认 慢成长" clearable />
          </n-form-item>
          <n-form-item label="署名寄语" style="margin-bottom: 12px">
            <n-input v-model:value="form.tagline" placeholder="默认：每一篇文章都是生活与阅读的深度思考" clearable />
          </n-form-item>
          <n-form-item label="联系方式（留空则不显示如有疑问段）">
            <n-input v-model:value="form.contact" placeholder="如：support@bitlesu.com 或 微信 xxx" clearable />
          </n-form-item>
        </n-collapse-item>
      </n-collapse>

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px">
        <n-button @click="emit('close')">取消</n-button>
        <n-button type="primary" :loading="loading" :disabled="sendDisabled" @click="emit('send')">
          {{ sendLabel }}
        </n-button>
      </div>
    </n-form>
  </div>
</template>

<style scoped>
/* 收件邮箱分组容器：浅色 / 深色双套，跟随 isDark */
.email-group {
  background: #F8FAFC;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.email-hint {
  font-size: 11px;
  color: #94A3B8;
  margin-top: 4px;
}

/* 发送成功结果页：badge / 标题 / 激活码框，均为浅色硬编码，深色下需翻转 */
.success-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #D1FAE5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.success-title {
  font-size: 15px;
  font-weight: 600;
  color: #1E293B;
  margin-bottom: 16px;
}
.success-code {
  font-family: monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #2563EB;
  background: #F1F5F9;
  padding: 16px 20px;
  border-radius: 10px;
  word-break: break-all;
  margin-bottom: 16px;
}

/* 深色模式：跟随 isDark ref 动态绑 .dark class（项目未把 dark 状态写进 DOM，
   只通过 n-config-provider 切换 naive 组件主题，所以这里用组件内 class 而非 html.dark） */
.thanks-panel.dark .email-group {
  background: rgba(148, 163, 184, 0.08);
}
.thanks-panel.dark .success-badge {
  background: rgba(16, 185, 129, 0.18);
}
.thanks-panel.dark .success-title {
  color: #F1F5F9;
}
.thanks-panel.dark .success-code {
  color: #60A5FA;
  background: rgba(148, 163, 184, 0.12);
}
</style>
