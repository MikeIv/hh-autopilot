<script setup lang="ts">
/** Волна 1: только каркас. Очередь ревью, настройки и статистика — волна 6. */
const title = 'hh-autopilot'
const subtitle = 'Локальный подбор вакансий hh: сбор, скоринг и очередь ревью.'

useHead({ title })
</script>

<template>
  <main>
    <h1>{{ title }}</h1>
    <p>{{ subtitle }}</p>
    <p>Экран очереди ревью появится в волне 6.</p>
  </main>
</template>
