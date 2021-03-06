const rootKeys = ['class-name', 'class', 'style']

const cached = (fn) => {
  const cache = Object.create(null)
  return (function cachedFn (str) {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  })
}
const hyphenate = cached((str) => {
  return str.replace(/\B([A-Z])/g, '-$1').toLowerCase()
})

function propsToData (props, doc) {
  return Object.keys(props).reduce(function (data, key) {
    const k = key.replace(/.*:/, '')
    const obj = rootKeys.includes(k) ? data : data.attrs
    const value = props[key]
    if (key === 'className') {
      obj.class = props.className.join(' ')
    } else if (key.indexOf('data') === 0) {
      obj[key.replace(/[A-Z]/g, (g) => `-${g.toLowerCase()}`)] = value
    } else if (key === 'v-bind') {
      let val = doc[value]
      if (!val) {
        val = eval(`(${value})`)
      }
      obj = Object.assign(obj, val)
    } else if (key.indexOf(':') === 0 || key.indexOf('v-bind:') === 0) {
      key = key.replace('v-bind:', '').replace(':', '')
      if (doc[value]) {
        obj[key] = doc[value]
      } else {
        obj[key] = eval(`(${value})`)
      }
    } else {
      obj[hyphenate(key)] = value
    }
    return data
  }, { attrs: {} })
}

/**
 * Create the scoped slots from `node` template children. Templates for default
 * slots are processed as regular children in `processNode`.
 */
function slotsToData (node, h, doc) {
  const data = {}
  const children = node.children || []

  children.forEach(child => {
    // Regular children and default templates are processed inside `processNode`.
    if (!isTemplate(child) || isDefaultTemplate(child)) { return }

    // Non-default templates are converted into slots.
    data.scopedSlots = data.scopedSlots || {}
    const template = child
    const name = getSlotName(template)
    const vDomTree = template.content.map(tmplNode => processNode(tmplNode, h, doc))
    data.scopedSlots[name] = function () { return vDomTree }
  })

  return data
}

function processNode (node, h, doc) {
  /**
   * Return raw value as it is
   */
  if (node.type === 'text') {
    return node.value
  }

  const slotData = slotsToData(node || {}, h, doc)
  const propData = propsToData(node.props, doc)
  const data = Object.assign({}, slotData, propData)

  /**
   * Process child nodes, flat-mapping templates pointing to default slots.
   */
  const children = []
  for (const child of node.children) {
    // Template nodes pointing to non-default slots are processed inside `slotsToData`.
    if (isTemplate(child) && !isDefaultTemplate(child)) { continue }

    const processQueue = isDefaultTemplate(child) ? child.content : [child]
    children.push(...processQueue.map((node) => processNode(node, h, doc)))
  }

  return h(node.tag, data, children)
}

const DEFAULT_SLOT = 'default'

function isDefaultTemplate (node) {
  return isTemplate(node) && getSlotName(node) === DEFAULT_SLOT
}

function isTemplate (node) {
  return node.tag === 'template'
}

function getSlotName (node) {
  let name = ''
  for (const propName of Object.keys(node.props)) {
    if (!propName.startsWith('#') && !propName.startsWith('v-slot:')) { return }
    name = propName.split(/[:#]/, 2)[1]
    break
  }
  return name || DEFAULT_SLOT
}

export default {
  name: 'NuxtContent',
  functional: true,
  props: {
    document: {
      required: true
    }
  },
  render (h, { data, props }) {
    const { document } = props
    const { body } = document || {}
    if (!body || !body.children || !Array.isArray(body.children)) {
      return
    }
    data.class = Object.assign({ 'nuxt-content': true }, data.class)
    data.props = Object.assign({ ...body.props }, data.props)
    return h('div', data, body.children.map((child) => processNode(child, h, document)))
  }
}
