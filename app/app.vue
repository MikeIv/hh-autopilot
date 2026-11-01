<script setup lang="ts">
/** Каркас приложения: единственная страница — очередь ревью. */
const themeBoot = `(function(){try{var stored=localStorage.getItem('hh-theme');var theme=stored==='light'||stored==='dark'?stored:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;}catch(e){}})();`

useHead({
  title: 'hh-autopilot',
  script: [
    {
      key: 'theme-boot',
      innerHTML: themeBoot,
      tagPriority: 'critical',
    },
  ],
})
</script>

<template>
  <NuxtPage />
</template>
