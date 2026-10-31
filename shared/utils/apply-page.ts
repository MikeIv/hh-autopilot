import { parseDocument } from 'htmlparser2'

type Document = ReturnType<typeof parseDocument>
type Node = Document['children'][number]

/** Дети узла: у текста и комментариев их нет, у элементов и корня — есть. */
function childrenOf(node: Node): readonly Node[] {
  return 'children' in node ? node.children : []
}

/** Обход поддерева сверху вниз: кнопка, поле письма и подтверждение разбросаны по узлам hh. */
function* walk(nodes: readonly Node[]): Generator<Node> {
  for (const node of nodes) {
    yield node
    yield* walk(childrenOf(node))
  }
}

/** Текст элемента без разметки: пробелы схлопываются, `&nbsp;` уже раскодирован. */
function textOf(node: Node): string {
  if (node.type === 'text') {
    return node.data
  }
  return childrenOf(node).map(textOf).join(' ')
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Маркеры разметки hh: на `data-qa` держатся кнопки и поля формы отклика. */
const dataQa = (node: Node): string => (node.type === 'tag' ? (node.attribs['data-qa'] ?? '') : '')

/** Кнопка «Откликнуться»: hh ставит её сверху и снизу карточки вакансии. */
const APPLY_BUTTON_QA = /^vacancy-response-link-(top|bottom)$/

/** Поле сопроводительного письма: textarea с это меткой или `name="letter"`. */
const LETTER_FIELD_QA = /letter(-input)?$/

/** Кнопка отправки внутри формы отклика. */
const SUBMIT_QA = /^(vacancy-response-(submit|submit-popup)|response-submit)$/

/** Текст, которым hh подтверждает отправку или сообщает, что отклик уже был. */
const ALREADY_APPLIED_TEXT =
  /(отклик отправлен|вы уже откликнулись|вы откликнулись|уже откликались)/iu

/** Состояние страницы вакансии или формы отклика: по нему решается, что нажимать. */
export interface ApplyPageState {
  hasApplyButton: boolean
  alreadyApplied: boolean
  hasLetterField: boolean
  hasSubmitButton: boolean
  successText: string | null
}

/**
 * Разбирает сохранённую страницу hh: есть ли кнопка отклика, открыта ли форма
 * с полем письма и подтвердила ли hh отправку. Возвращает только факты разметки.
 */
export function parseApplyPage(html: string): ApplyPageState {
  const document = parseDocument(html)
  const nodes = [...walk(document.children)]

  let hasApplyButton = false
  let disabledApplyButton = false
  let hasLetterField = false
  let hasSubmitButton = false

  for (const node of nodes) {
    if (node.type !== 'tag') {
      continue
    }

    const qa = dataQa(node)
    const attributes = node.attribs

    if (APPLY_BUTTON_QA.test(qa)) {
      hasApplyButton = true
      if ('disabled' in attributes || /disabled/iu.test(attributes.class ?? '')) {
        disabledApplyButton = true
      }
    }

    if (node.name === 'textarea' && (LETTER_FIELD_QA.test(qa) || attributes.name === 'letter')) {
      hasLetterField = true
    }

    if (
      node.name === 'button' &&
      (SUBMIT_QA.test(qa) || /отправить отклик/iu.test(clean(textOf(node))))
    ) {
      hasSubmitButton = true
    }
  }

  const text = clean(document.children.map(textOf).join(' '))
  const successMatch = ALREADY_APPLIED_TEXT.exec(text)

  return {
    hasApplyButton,
    // Отклик считаем отправленным, только если hh прямо это подтвердил или погасил кнопку.
    alreadyApplied: disabledApplyButton || (!hasApplyButton && successMatch !== null),
    hasLetterField,
    hasSubmitButton,
    successText: successMatch ? successMatch[0] : null,
  }
}
