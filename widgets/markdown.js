import marked from 'marked'
import Widget from './widget'
export default class MarkdownWidget extends Widget {
  // eslint-disable-next-line require-await
  async parse(content, path) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    return marked(content[this.field.get('name')], { sanitize: false })
  }
}
