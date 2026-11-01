<script setup lang="ts">
import type { RunStatus } from '../../shared/types/domain'

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

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'идёт',
  done: 'завершён',
  failed: 'ошибка',
  needs_human: 'нужен человек',
}

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
const lastRun = computed(() => applyStatus.value?.lastRun ?? null)

/** Подпись дропдауна последнего прогона: статус и время окончания. */
const lastRunLabel = computed(() => {
  const run = lastRun.value
  if (!run) {
    return ''
  }

  const time = new Date(run.finishedAt ?? run.startedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${RUN_STATUS_LABELS[run.status]} · ${time}`
})
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
      <header :class="$style.topbar">
        <div :class="$style.brand">
          <h1 :class="$style.title">Очередь ревью</h1>
          <p :class="$style.subtitle">
            Сначала Nuxt, затем Vue и Nitro · окно 10:00–19:00 МСК · до 20 откликов в день
          </p>
        </div>

        <div :class="$style.topbarSide">
          <dl :class="$style.meters">
            <div :class="$style.meter">
              <dt :class="$style.meterLabel">Одобрено сегодня</dt>
              <dd :class="$style.meterValue">
                {{ stats?.approvedToday ?? 0 }}
                <span :class="$style.meterTotal">/ {{ stats?.dailyLimit ?? 0 }}</span>
                <progress
                  :class="$style.meterBar"
                  :value="stats?.approvedToday ?? 0"
                  :max="stats?.dailyLimit || 1"
                  aria-hidden="true"
                />
              </dd>
            </div>
            <div :class="$style.meter">
              <dt :class="$style.meterLabel">Отправлено сегодня</dt>
              <dd :class="$style.meterValue">
                {{ stats?.sentToday ?? 0 }}
                <span :class="$style.meterTotal">/ {{ stats?.dailyLimit ?? 0 }}</span>
                <progress
                  :class="$style.meterBar"
                  :value="stats?.sentToday ?? 0"
                  :max="stats?.dailyLimit || 1"
                  aria-hidden="true"
                />
              </dd>
            </div>
            <div :class="$style.meter">
              <dt :class="$style.meterLabel">Порог</dt>
              <dd :class="$style.meterValue">{{ stats?.threshold ?? 0 }}</dd>
            </div>
          </dl>

          <div :class="$style.topbarActions">
            <UiButton
              variant="secondary"
              :disabled="refreshing || applyActive"
              @click="refreshFromHh"
            >
              {{ refreshing ? 'Обновляю выдачу…' : 'Обновить с hh' }}
            </UiButton>
            <ClientOnly>
              <ThemeToggle />
              <template #fallback>
                <span :class="$style.switchPlaceholder" aria-hidden="true" />
              </template>
            </ClientOnly>
          </div>
        </div>
      </header>

      <div :class="$style.board">
        <aside :class="$style.rail">
          <section :class="$style.apply" aria-labelledby="apply-title">
            <h2 id="apply-title" :class="$style.applyTitle">Отправка откликов</h2>

            <p :class="$style.stateRow">
              <UiPill :tone="applyStatus?.autoApplyEnabled ? 'good' : 'neutral'" dot>
                Авто-отправка {{ applyStatus?.autoApplyEnabled ? 'включена' : 'выключена' }}
              </UiPill>
              <UiPill :tone="applyStatus?.windowOpen ? 'good' : 'bad'" dot>
                Окно {{ applyStatus?.windowOpen ? 'открыто' : 'закрыто' }}
              </UiPill>
              <UiPill :tone="panicAt ? 'bad' : 'neutral'" dot>
                Стоп {{ panicAt ? 'активен' : 'нет' }}
              </UiPill>
            </p>

            <div :class="$style.applyActions">
              <UiButton
                :disabled="starting || applyActive || refreshing || !applyStatus?.autoApplyEnabled"
                @click="start(false)"
              >
                Запустить прогон
              </UiButton>
              <div :class="$style.applySecondary">
                <UiButton variant="secondary" :disabled="starting" @click="start(true)">
                  Сухой прогон
                </UiButton>
                <UiButton variant="danger" :disabled="!applyActive && !panicAt" @click="panic">
                  Стоп (panic)
                </UiButton>
                <UiButton v-if="panicAt" variant="secondary" @click="releasePanic">
                  Снять стоп
                </UiButton>
              </div>
            </div>

            <UiNotice v-if="applyActive">
              Прогон идёт на сервере — счётчики обновляются каждые 3 секунды.
            </UiNotice>
            <UiNotice v-if="runError" tone="error">{{ runError }}</UiNotice>

            <UiDisclosure v-if="!applyStatus?.autoApplyEnabled">
              <template #summary>Живая отправка выключена — что сделать</template>
              <p>
                Включи <code>HH_AUTO_APPLY=true</code> в <code>.env</code> и перезапусти сервер.
                Кнопка «Отправить сейчас» в карточке работает и без неё.
              </p>
            </UiDisclosure>

            <UiDisclosure v-if="lastRun">
              <template #summary>Последний прогон · {{ lastRunLabel }}</template>
              <p v-if="lastRun.message">{{ lastRun.message }}</p>
            </UiDisclosure>

            <UiDisclosure v-if="dryRun" :key="dryRun.startedAt" :open="true">
              <template #summary>
                План сухого прогона · {{ dryRun.planned.length }} к отправке
              </template>
              <p>{{ dryRun.message }}</p>
              <ul v-if="dryRun.planned.length" :class="$style.plan">
                <li v-for="target in dryRun.planned" :key="target.vacancyId">
                  <a :class="$style.planLink" :href="target.url" target="_blank" rel="noreferrer">
                    {{ target.title }}
                  </a>
                  <span :class="$style.planMeta">
                    — {{ target.company }} · {{ target.variant }} · {{ target.charCount }} знаков
                  </span>
                </li>
              </ul>
              <ul v-if="dryRun.skips.length" :class="$style.skips">
                <li v-for="skip in dryRun.skips" :key="skip.vacancyId">
                  Пропуск: «{{ skip.title }}» — {{ skip.message }}
                </li>
              </ul>
            </UiDisclosure>
          </section>
        </aside>

        <div :class="$style.main">
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
            Пусто: собери вакансии, оцени их и подготовь письма командами
            <code>pnpm hh:collect</code>, <code>pnpm hh:score</code> и <code>pnpm hh:letters</code>.
          </UiNotice>

          <template v-else>
            <section :class="$style.section">
              <h2 :class="$style.sectionTitle">
                Ждут решения <UiPill>{{ waiting.length }}</UiPill>
              </h2>
              <UiNotice v-if="waiting.length === 0">Всё разобрано.</UiNotice>
              <QueueList
                :items="waiting"
                :deciding="deciding"
                :decision-kind="decisionKind"
                :choosing="choosing"
                :letter-variant="letterVariant"
                :sending="sending"
                @decide="decide"
                @choose="chooseVariant"
                @send="sendNow"
              />
            </section>

            <section v-if="working.length > 0" :class="$style.section">
              <h2 :class="$style.sectionTitle">
                В работе <UiPill>{{ working.length }}</UiPill>
              </h2>
              <QueueList
                :items="working"
                :deciding="deciding"
                :decision-kind="decisionKind"
                :choosing="choosing"
                :letter-variant="letterVariant"
                :sending="sending"
                @decide="decide"
                @choose="chooseVariant"
                @send="sendNow"
              />
            </section>

            <UiDisclosure v-if="decided.length > 0">
              <template #summary>Разобранные · {{ decided.length }}</template>
              <QueueList
                :items="decided"
                :deciding="deciding"
                :decision-kind="decisionKind"
                :choosing="choosing"
                :letter-variant="letterVariant"
                :sending="sending"
                @decide="decide"
                @choose="chooseVariant"
                @send="sendNow"
              />
            </UiDisclosure>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>

<style module lang="scss">
.page {
  max-width: 88rem;
  margin: 0 auto;
  padding: var(--space-2) 20px 64px;
  color: var(--text);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.busy {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(3px);
}

.busyPanel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  max-width: 22rem;
  padding: var(--space-4) var(--space-3);
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  text-align: center;
}

.busyText {
  margin: 0;
  color: var(--text);
  font-weight: 600;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  /* Шапка тянется на всю ширину страницы, включая её боковые отступы. */
  margin: 0 -20px;
  padding: var(--space-2) 20px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
}

.subtitle {
  margin: 0;
  max-width: 38rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.topbarSide {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-end;
  justify-content: flex-end;
}

.meters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
}

.meter {
  min-width: 7.5rem;
}

.meterLabel {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.meterValue {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.meterTotal {
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 500;
}

.meterBar {
  display: block;
  width: 100%;
  height: 4px;
  margin-top: 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  appearance: none;
  overflow: hidden;

  &::-webkit-progress-bar {
    border-radius: var(--radius-pill);
    background: var(--surface-muted);
  }

  &::-webkit-progress-value {
    border-radius: var(--radius-pill);
    background: var(--success);
  }

  &::-moz-progress-bar {
    border-radius: var(--radius-pill);
    background: var(--success);
  }
}

.topbarActions {
  display: flex;
  gap: var(--space-1);
  align-items: center;
}

/* Заглушка свитчера до гидратации: шапка не дёргается по ширине. */
.switchPlaceholder {
  width: 60px;
  height: 34px;
}

.board {
  display: grid;
  grid-template-areas:
    'rail'
    'main';
  gap: var(--space-3);
  align-items: start;
}

.main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  grid-area: main;
  min-width: 0;
}

.rail {
  grid-area: rail;
  min-width: 0;
}

@media (min-width: 1080px) {
  .board {
    grid-template-columns: minmax(0, 1fr) 22rem;
    grid-template-areas: 'main rail';
  }

  .rail {
    position: sticky;
    top: var(--sticky-top);
    max-height: calc(100dvh - var(--sticky-top) - var(--space-2));
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
}

@media (max-width: 720px) {
  .topbar {
    position: static;
  }

  .title {
    font-size: 1.5rem;
  }
}

.apply {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.applyTitle {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.stateRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.applyActions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.applySecondary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.plan,
.skips {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: var(--space-1) 0 0;
  padding-left: 1.1rem;
}

.skips {
  color: var(--danger);
}

.planLink {
  color: var(--text);
  font-weight: 600;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.planMeta {
  color: var(--text-muted);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sectionTitle {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.loading {
  display: flex;
  justify-content: center;
  padding: var(--space-3);
}
</style>
