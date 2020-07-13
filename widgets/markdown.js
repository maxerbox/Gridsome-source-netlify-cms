import marked from 'marked'
import sanatize from 'sanitize-html'
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
    return sanatize(marked(content[this.field.get('name')]), {
      allowedTags: sanatize.defaults.allowedTags.concat([
        'h1',
        'h2',
        'img',
        'span',
      ]),
    })
  }
}
