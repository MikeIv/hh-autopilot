<script setup lang="ts">
/** Очередь ревью: что прошло порог, с оценкой и письмом. Отправка — волна 7. */
const { queue, deciding, decisionError, decide } = useQueue()

useHead({ title: 'Очередь ревью — hh-autopilot' })

const stats = computed(() => queue.data.value)
const items = computed(() => stats.value?.items ?? [])
const loading = computed(() => queue.pending.value)
const failed = computed(() => Boolean(queue.error.value))
const waiting = computed(() => items.value.filter((item) => item.status === 'queued'))
const decided = computed(() => items.value.filter((item) => item.status !== 'queued'))
</script>

<template>
  <main :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.intro">
        <h1 :class="$style.title">Очередь ревью</h1>
        <p :class="$style.subtitle">
          Вакансии, прошедшие порог оценки. Отправка откликов появится в волне 7 — сейчас решение
          только записывается в базу.
        </p>
      </div>

      <dl :class="$style.counters">
        <div :class="$style.counter">
          <dt :class="$style.counterLabel">Одобрено сегодня</dt>
          <dd :class="$style.counterValue">
            {{ stats?.approvedToday ?? 0 }} / {{ stats?.dailyLimit ?? 0 }}
          </dd>
        </div>
        <div :class="$style.counter">
          <dt :class="$style.counterLabel">Отправлено сегодня</dt>
          <dd :class="$style.counterValue">
            {{ stats?.sentToday ?? 0 }} / {{ stats?.dailyLimit ?? 0 }}
          </dd>
        </div>
        <div :class="$style.counter">
          <dt :class="$style.counterLabel">Порог</dt>
          <dd :class="$style.counterValue">{{ stats?.threshold ?? 0 }}</dd>
        </div>
      </dl>
    </header>

    <p v-if="decisionError" :class="$style.error">{{ decisionError }}</p>

    <p v-if="loading" :class="$style.note">Загружаю очередь…</p>

    <p v-else-if="failed" :class="$style.error">
      Не удалось загрузить очередь — обнови страницу или проверь базу.
    </p>

    <p v-else-if="items.length === 0" :class="$style.empty">
      Пусто: собери вакансии (<code>pnpm hh:collect</code>), оцени их (<code>pnpm hh:score</code>) и
      подготовь письма (<code>pnpm hh:letters</code>).
    </p>

    <template v-else>
      <section :class="$style.section">
        <h2 :class="$style.sectionTitle">Ждут решения — {{ waiting.length }}</h2>
        <p v-if="waiting.length === 0" :class="$style.note">Всё разобрано.</p>
        <ul :class="$style.list">
          <li v-for="item in waiting" :key="item.vacancyId">
            <QueueCard
              :item="item"
              :pending="deciding === item.vacancyId"
              @decide="decide(item, $event)"
            />
          </li>
        </ul>
      </section>

      <section v-if="decided.length > 0" :class="$style.section">
        <h2 :class="$style.sectionTitle">Разобранные — {{ decided.length }}</h2>
        <ul :class="$style.list">
          <li v-for="item in decided" :key="item.vacancyId">
            <QueueCard :item="item" @decide="decide(item, $event)" />
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style module lang="scss">
.page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  color: #232a36;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 42rem;
}

.title {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.25;
}

.subtitle {
  margin: 0;
  color: #5c6472;
  font-size: 0.95rem;
}

.counters {
  display: flex;
  gap: 0.5rem;
  margin: 0;
}

.counter {
  min-width: 8.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #d8dce3;
  border-radius: 0.6rem;
  background: #f7f8fa;
}

.counterLabel {
  color: #5c6472;
  font-size: 0.75rem;
}

.counterValue {
  margin: 0.15rem 0 0;
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sectionTitle {
  margin: 0;
  color: #33415c;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.note,
.empty {
  margin: 0;
  color: #5c6472;
  font-size: 0.95rem;
}

.error {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  background: #fdecec;
  color: #8a1f1f;
  font-size: 0.9rem;
}
</style>
