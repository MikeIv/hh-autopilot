<script setup lang="ts">
/** Очередь ревью и отправка: решения, выбор письма, прогон и panic. */
const {
  queue,
  deciding,
  choosing,
  sending,
  decisionError,
  notice,
  decide,
  chooseVariant,
  sendNow,
} = useQueue()
const {
  data: applyStatus,
  active: applyActive,
  starting,
  runError,
  dryRun,
  start,
  panic,
  releasePanic,
} = useApply()

useHead({ title: 'Очередь ревью — hh-autopilot' })

const stats = computed(() => queue.data.value)
const items = computed(() => stats.value?.items ?? [])
const loading = computed(() => queue.pending.value)
const failed = computed(() => Boolean(queue.error.value))
const waiting = computed(() => items.value.filter((item) => item.status === 'queued'))
const working = computed(() =>
  items.value.filter(
    (item) =>
      item.status === 'approved' || item.status === 'failed' || item.status === 'needs_human',
  ),
)
const decided = computed(() =>
  items.value.filter(
    (item) =>
      item.status !== 'queued' &&
      item.status !== 'approved' &&
      item.status !== 'failed' &&
      item.status !== 'needs_human',
  ),
)
const panicAt = computed(() => applyStatus.value?.panicAt ?? null)
</script>

<template>
  <main :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.intro">
        <h1 :class="$style.title">Очередь ревью</h1>
        <p :class="$style.subtitle">
          Сначала вакансии с Nuxt, затем с Vue и Nitro; внутри группы — по убыванию оценки.
          Одобренные отклики уходят на hh через браузер: окно 10:00–19:00 МСК, лимит 20 в день,
          капча — остановка. Авто-отправка включается только переменной HH_AUTO_APPLY.
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

    <section :class="$style.apply" aria-labelledby="apply-title">
      <div :class="$style.applyHeader">
        <h2 id="apply-title" :class="$style.sectionTitle">Отправка откликов</h2>
        <dl :class="$style.applyState">
          <div :class="$style.applyStateItem">
            <dt :class="$style.applyStateLabel">Авто-отправка</dt>
            <dd :class="[$style.applyStateValue, applyStatus?.autoApplyEnabled && $style.stateOn]">
              {{ applyStatus?.autoApplyEnabled ? 'включена' : 'выключена (только сухой прогон)' }}
            </dd>
          </div>
          <div :class="$style.applyStateItem">
            <dt :class="$style.applyStateLabel">Окно</dt>
            <dd :class="[$style.applyStateValue, applyStatus?.windowOpen && $style.stateOn]">
              {{ applyStatus?.windowOpen ? 'открыто' : 'закрыто' }}
            </dd>
          </div>
          <div :class="$style.applyStateItem">
            <dt :class="$style.applyStateLabel">Стоп</dt>
            <dd :class="[$style.applyStateValue, panicAt && $style.stateStop]">
              {{ panicAt ? 'активен (panic)' : 'нет' }}
            </dd>
          </div>
        </dl>
      </div>

      <div :class="$style.applyActions">
        <button
          type="button"
          :class="[$style.button, $style.dry]"
          :disabled="starting"
          @click="start(true)"
        >
          Сухой прогон
        </button>
        <button
          type="button"
          :class="[$style.button, $style.send]"
          :disabled="starting || applyActive || !applyStatus?.autoApplyEnabled"
          @click="start(false)"
        >
          Запустить прогон
        </button>
        <button
          type="button"
          :class="[$style.button, $style.stop]"
          :disabled="!applyActive && !panicAt"
          @click="panic"
        >
          Стоп (panic)
        </button>
        <button v-if="panicAt" type="button" :class="$style.button" @click="releasePanic">
          Снять стоп
        </button>
      </div>

      <p v-if="applyActive" :class="$style.note">
        Прогон идёт на сервере — счётчики обновляются каждые 3 секунды.
      </p>
      <p v-if="!applyStatus?.autoApplyEnabled" :class="$style.note">
        Живая отправка выключена: включи <code>HH_AUTO_APPLY=true</code> в <code>.env</code> и
        перезапусти сервер. Кнопка «Отправить сейчас» в карточке работает и без неё.
      </p>
      <p v-if="runError" :class="$style.error">{{ runError }}</p>
      <p v-if="applyStatus?.lastRun?.message" :class="$style.note">
        Последний прогон: {{ applyStatus.lastRun.message }}
      </p>

      <template v-if="dryRun">
        <p :class="$style.note">{{ dryRun.message }}</p>
        <ul :class="$style.plan">
          <li v-for="target in dryRun.planned" :key="target.vacancyId">
            <a :class="$style.planLink" :href="target.url" target="_blank" rel="noreferrer">
              {{ target.title }}
            </a>
            — {{ target.company }} · {{ target.variant }} · {{ target.charCount }} знаков
          </li>
        </ul>
        <p v-for="skip in dryRun.skips" :key="skip.vacancyId" :class="$style.note">
          Пропуск: «{{ skip.title }}» — {{ skip.message }}
        </p>
      </template>
    </section>

    <p v-if="decisionError" :class="$style.error">{{ decisionError }}</p>
    <p v-if="notice" :class="$style.success">{{ notice }}</p>

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
              :choosing="choosing === item.vacancyId"
              :sending="sending === item.vacancyId"
              @decide="decide(item, $event)"
              @choose="chooseVariant(item, $event)"
              @send="sendNow(item)"
            />
          </li>
        </ul>
      </section>

      <section v-if="working.length > 0" :class="$style.section">
        <h2 :class="$style.sectionTitle">В работе — {{ working.length }}</h2>
        <ul :class="$style.list">
          <li v-for="item in working" :key="item.vacancyId">
            <QueueCard
              :item="item"
              :pending="deciding === item.vacancyId"
              :choosing="choosing === item.vacancyId"
              :sending="sending === item.vacancyId"
              @decide="decide(item, $event)"
              @choose="chooseVariant(item, $event)"
              @send="sendNow(item)"
            />
          </li>
        </ul>
      </section>

      <section v-if="decided.length > 0" :class="$style.section">
        <h2 :class="$style.sectionTitle">Разобранные — {{ decided.length }}</h2>
        <ul :class="$style.list">
          <li v-for="item in decided" :key="item.vacancyId">
            <QueueCard
              :item="item"
              :choosing="choosing === item.vacancyId"
              :sending="sending === item.vacancyId"
              @decide="decide(item, $event)"
              @choose="chooseVariant(item, $event)"
              @send="sendNow(item)"
            />
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

.apply {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid #d8dce3;
  border-radius: 0.75rem;
  background: #fff;
}

.applyHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.applyState {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0;
}

.applyStateItem {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.applyStateLabel {
  color: #5c6472;
  font-size: 0.75rem;
}

.applyStateValue {
  margin: 0;
  color: #5c6472;
  font-size: 0.9rem;
  font-weight: 600;
}

.stateOn {
  color: #1c6b3a;
}

.stateStop {
  color: #8a1f1f;
}

.applyActions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.button {
  padding: 0.4rem 0.9rem;
  border: 1px solid #d8dce3;
  border-radius: 0.5rem;
  background: #fff;
  color: #232a36;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.dry {
  border-color: #15294b;
  color: #15294b;
}

.send {
  border-color: #15294b;
  background: #15294b;
  color: #fff;
}

.stop {
  border-color: #8a1f1f;
  color: #8a1f1f;
}

.plan {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding-left: 1.25rem;
  color: #33415c;
  font-size: 0.9rem;
}

.planLink {
  color: #15294b;
  font-weight: 600;
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

.success {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  background: #e3f2e8;
  color: #1c6b3a;
  font-size: 0.9rem;
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
