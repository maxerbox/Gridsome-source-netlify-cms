import { trimStart } from 'lodash'
import Widget from './widget'

export default class ImageWidget extends Widget {
  async parse(content) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }

    return trimStart(
      content[this.field.get('name')].replace(
        this.parser.netlifyConfig.get('public_folder'),
        ''
      ),
      '/'
    )
  }
}
