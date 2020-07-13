import path from 'path'
import Widget from './widget'

export default class ImageWidget extends Widget {
  async parse(content) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    const filename = path.basename(content[this.field.get('name')])

    return path.join(
      path.join(
        this.parser.context,
        this.parser.netlifyConfig.get('media_folder'),
        filename
      )
    )
  }
}
