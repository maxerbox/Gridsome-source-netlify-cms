import path from 'path'
import Widget from './widget'

export default class ImageWidget extends Widget {
  constructor(parser, field, collection, schema) {
    super(parser, field, collection, schema)

    this.mediaFolder = path.join(
      this.parser.context,
      this.parser.netlifyConfig.get('media_folder')
    )
  }

  parse(content) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    return content[this.field.get('name')]
  }
}
