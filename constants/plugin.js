export const supportedMimeTypes = ['application/json', 'text/yaml']
export const isSupportedMime = (mime) => {
  return supportedMimeTypes.includes(mime)
}
