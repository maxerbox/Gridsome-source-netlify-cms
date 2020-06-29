import mime from 'mime-types'
import Widget from './widget'
export default class MarkdownWidget extends Widget {
  parse(content) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    const data = content[this.field.get('name')]
    return this.parser.transformNodeContent(
      data,
      mime.lookup('.md'),
      this.collection
    )
  }
}
