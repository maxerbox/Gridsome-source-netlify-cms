export default class Widget {
  constructor(parser, field, collection, schema) {
    this.parser = parser
    this.field = field
    this.collection = collection
    this.schema = schema
  }

  parse(content) {
    if (!content) {
      return null
    }
    return Object.prototype.hasOwnProperty.call(content, this.field.get('name'))
      ? content[this.field.get('name')]
      : null
  }
}
