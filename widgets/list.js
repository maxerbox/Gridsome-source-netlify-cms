import Widget from './widget'
export default class ListWidget extends Widget {
  getFields() {
    return [...(this.field.get('fields') || this.field.get('field') || [])]
  }

  parse(content) {
    if (
      !content ||
      !Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
    ) {
      return null
    }
    let data = content[this.field.get('name')]
    data = Array.isArray(data) ? data : [data]
    return data.map((row) => {
      return this.parser.parseFields(row, this.getFields(), this.collection)
    })
  }
}
