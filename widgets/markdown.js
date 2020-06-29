import mime from 'mime-types'
import marked from 'marked'
import sanatize from 'sanitize-html'
import Widget from './widget'
export default class MarkdownWidget extends Widget {
  async parse(content, path) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    return sanatize(marked(content[this.field.get('name')]))
  }
}
