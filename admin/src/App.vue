<script setup lang="ts">
import { naiveTheme, themeOverrides } from './theme'
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :z-index="10010">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
