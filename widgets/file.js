import { trimStart } from 'lodash'
import Widget from './widget'

export default class FileWidget extends Widget {
  // eslint-disable-next-line require-await
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
