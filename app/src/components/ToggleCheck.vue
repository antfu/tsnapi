<script setup lang="ts">
defineProps<{ label: string, modelValue: boolean, icon?: string, title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="btn" :class="{ 'btn-active': modelValue }" :title="title">
    <input
      type="checkbox"
      class="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span v-if="icon" :class="icon" />
    {{ label }}
  </label>
</template>
