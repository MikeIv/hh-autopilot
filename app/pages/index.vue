<script setup lang="ts">
/** Очередь ревью и отправка: решения, выбор письма, прогон и panic. */
const {
  queue,
  deciding,
  decisionKind,
  choosing,
  letterVariant,
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
const { refreshing, refreshError, refreshNote, refreshFromHh } = useRefresh()

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
  <main :class="$style.page" :aria-busy="refreshing">
    <div v-if="refreshing" :class="$style.busy" role="status" aria-live="polite">
      <div :class="$style.busyPanel">
        <UiLoader size="lg" decorative />
        <p :class="$style.busyText">Читаю поиск hh и пересчитываю оценки</p>
      </div>
    </div>

    <div :class="$style.content" :inert="refreshing || undefined">
      <header :class="$style.header">
        <div :class="$style.intro">
          <div :class="$style.titleRow">
            <h1 :class="$style.title">Очередь ревью</h1>
            <ClientOnly>
              <ThemeToggle />
            </ClientOnly>
          </div>
          <p :class="$style.subtitle">
            Сначала вакансии с Nuxt, затем с Vue и Nitro. Одобренные отклики уходят на hh с 10:00 до
            19:00 МСК, не больше 20 в день.
          </p>
          <UiButton
            variant="secondary"
            :disabled="refreshing || applyActive"
            @click="refreshFromHh"
          >
            {{ refreshing ? 'Обновляю выдачу…' : 'Обновить с hh' }}
          </UiButton>
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
              <dd
                :class="[$style.applyStateValue, applyStatus?.autoApplyEnabled && $style.stateOn]"
              >
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
          <UiButton variant="secondary" :disabled="starting" @click="start(true)">
            Сухой прогон
          </UiButton>
          <UiButton
            :disabled="starting || applyActive || refreshing || !applyStatus?.autoApplyEnabled"
            @click="start(false)"
          >
            Запустить прогон
          </UiButton>
          <UiButton variant="danger" :disabled="!applyActive && !panicAt" @click="panic">
            Стоп (panic)
          </UiButton>
          <UiButton v-if="panicAt" variant="secondary" @click="releasePanic">Снять стоп</UiButton>
        </div>

        <UiNotice v-if="applyActive">
          Прогон идёт на сервере — счётчики обновляются каждые 3 секунды.
        </UiNotice>
        <UiNotice v-if="!applyStatus?.autoApplyEnabled">
          Живая отправка выключена: включи <code>HH_AUTO_APPLY=true</code> в <code>.env</code> и
          перезапусти сервер. Кнопка «Отправить сейчас» в карточке работает и без неё.
        </UiNotice>
        <UiNotice v-if="runError" tone="error">{{ runError }}</UiNotice>
        <UiNotice v-if="applyStatus?.lastRun?.message">
          Последний прогон: {{ applyStatus.lastRun.message }}
        </UiNotice>

        <template v-if="dryRun">
          <UiNotice>{{ dryRun.message }}</UiNotice>
          <ul :class="$style.plan">
            <li v-for="target in dryRun.planned" :key="target.vacancyId">
              <a :class="$style.planLink" :href="target.url" target="_blank" rel="noreferrer">
                {{ target.title }}
              </a>
              — {{ target.company }} · {{ target.variant }} · {{ target.charCount }} знаков
            </li>
          </ul>
          <UiNotice v-for="skip in dryRun.skips" :key="skip.vacancyId">
            Пропуск: «{{ skip.title }}» — {{ skip.message }}
          </UiNotice>
        </template>
      </section>

      <UiNotice v-if="refreshError" tone="error">{{ refreshError }}</UiNotice>
      <UiNotice v-if="refreshNote" tone="success">{{ refreshNote }}</UiNotice>
      <UiNotice v-if="decisionError" tone="error">{{ decisionError }}</UiNotice>
      <UiNotice v-if="notice" tone="success">{{ notice }}</UiNotice>

      <div v-if="loading" :class="$style.loading">
        <UiLoader size="md" label="Загружаю очередь" />
      </div>

      <UiNotice v-else-if="failed" tone="error">
        Не удалось загрузить очередь — обнови страницу или проверь базу.
      </UiNotice>

      <UiNotice v-else-if="items.length === 0">
        Пусто: собери вакансии (<code>pnpm hh:collect</code>), оцени их (<code>pnpm hh:score</code>)
        и подготовь письма (<code>pnpm hh:letters</code>).
      </UiNotice>

      <template v-else>
        <section :class="$style.section">
          <h2 :class="$style.sectionTitle">Ждут решения — {{ waiting.length }}</h2>
          <UiNotice v-if="waiting.length === 0">Всё разобрано.</UiNotice>
          <ul :class="$style.list">
            <li v-for="item in waiting" :key="item.vacancyId">
              <QueueCard
                :item="item"
                :pending="deciding === item.vacancyId"
                :decision="deciding === item.vacancyId ? decisionKind : null"
                :choosing="choosing === item.vacancyId"
                :choosing-variant="choosing === item.vacancyId ? letterVariant : null"
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
                :decision="deciding === item.vacancyId ? decisionKind : null"
                :choosing="choosing === item.vacancyId"
                :choosing-variant="choosing === item.vacancyId ? letterVariant : null"
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
                :pending="deciding === item.vacancyId"
                :decision="deciding === item.vacancyId ? decisionKind : null"
                :choosing="choosing === item.vacancyId"
                :choosing-variant="choosing === item.vacancyId ? letterVariant : null"
                :sending="sending === item.vacancyId"
                @decide="decide(item, $event)"
                @choose="chooseVariant(item, $event)"
                @send="sendNow(item)"
              />
            </li>
          </ul>
        </section>
      </template>
    </div>
  </main>
</template>

<style module lang="scss">
.page {
  position: relative;
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--space-3) 20px 64px;
  color: var(--text);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.busy {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  justify-content: center;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--bg) 84%, transparent);
}

.busyPanel {
  position: sticky;
  top: 28vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  align-self: flex-start;
  height: fit-content;
  padding: var(--space-3);
  text-align: center;
}

.busyText {
  margin: 0;
  max-width: 18rem;
  color: var(--text);
  font-weight: 600;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
}

.intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  max-width: 40rem;
}

.titleRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.15;
}

.subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 1rem;
}

.counters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
}

.counter {
  min-width: 9rem;
  padding: var(--space-2);
  border-radius: var(--radius-control);
  background: var(--surface);
}

.counterLabel {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.counterValue {
  margin: 4px 0 0;
  font-size: 1.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.apply {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.applyHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.applyState {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
}

.applyStateItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.applyStateLabel {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.applyStateValue {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 600;
}

.stateOn {
  color: var(--success);
}

.stateStop {
  color: var(--danger);
}

.applyActions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.plan {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 1.25rem;
  color: var(--text);
  font-size: 0.95rem;
}

.planLink {
  color: var(--text);
  font-weight: 600;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sectionTitle {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.loading {
  display: flex;
  justify-content: center;
  padding: var(--space-3);
}
</style>
