import Widget from './widget'

import { trimStart } from 'lodash'
export default class ListWidget extends Widget {
  getFields() {
    return [...(this.field.get('fields') || this.field.get('field') || [])]
  }

  async parse(content, path) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    let data = content[this.field.get('name')]
    data = Array.isArray(data) ? data : [data]
    return await Promise.all(
      data.map((row) =>
        this.parser.parseFields(
          row,
          this.getFields(),
          this.collection,
          trimStart(`${path}.${this.field.get('name')}`, '.')
        )
      )
    )
  }
}
