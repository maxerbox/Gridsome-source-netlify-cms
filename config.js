import yaml from 'yaml'
import { readFile } from 'fs-extra'
import { Map, fromJS } from 'immutable'
import { trimStart, trim, trimEnd } from 'lodash'
import * as publishModes from './constants/publishModes'
import { validateConfig } from './constants/configSchema'

const setDefaultPublicFolder = (map) => {
  if (map.has('media_folder') && !map.has('public_folder')) {
    map = map.set('public_folder', map.get('media_folder'))
  }
  return map
}

const defaults = {
  publish_mode: publishModes.SIMPLE,
}
export const traverseFields = (
  fields,
  updater,
  done = () => false,
  prefix = ''
) => {
  if (done()) {
    return fields
  }
  fields = fields.map((f) => {
    const field = updater(
      f,
      trimStart(`${trimEnd(prefix, '.')}.${f.get('name')}`, '.')
    )
    if (done()) {
      return field
    } else if (field.has('fields')) {
      return field.set(
        'fields',
        traverseFields(
          field.get('fields'),
          updater,
          done,
          `${prefix}${field.get('name')}.`
        )
      )
    } else if (field.has('field')) {
      return field.set(
        'field',
        traverseFields(
          [field.get('field')],
          updater,
          done,
          `${prefix}${field.get('name')}.`
        ).get(0)
      )
    } else if (field.has('types')) {
      return field.set(
        'types',
        traverseFields(
          field.get('types'),
          updater,
          done,
          `${prefix}${field.get('name')}.`
        )
      )
    } else {
      return field
    }
  })
  return fields
}
export function applyDefaults(config) {
  return Map(defaults)
    .mergeDeep(config)
    .withMutations((map) => {
      // Use `site_url` as default `display_url`.
      if (!map.get('display_url') && map.get('site_url')) {
        map.set('display_url', map.get('site_url'))
      }

      // Use media_folder as default public_folder.
      const defaultPublicFolder = `/${trimStart(map.get('media_folder'), '/')}`
      if (!map.has('public_folder')) {
        map.set('public_folder', defaultPublicFolder)
      }

      // default values for the slug config
      if (!map.getIn(['slug', 'encoding'])) {
        map.setIn(['slug', 'encoding'], 'unicode')
      }

      if (!map.getIn(['slug', 'clean_accents'])) {
        map.setIn(['slug', 'clean_accents'], false)
      }

      if (!map.getIn(['slug', 'sanitize_replacement'])) {
        map.setIn(['slug', 'sanitize_replacement'], '-')
      }

      // Strip leading slash from collection folders and files
      map.set(
        'collections',
        map.get('collections').map((collection) => {
          if (!collection.has('publish')) {
            collection = collection.set('publish', true)
          }

          const folder = collection.get('folder')
          if (folder) {
            if (collection.has('path') && !collection.has('media_folder')) {
              // default value for media folder when using the path config
              collection = collection.set('media_folder', '')
            }
            collection = setDefaultPublicFolder(collection)
            collection = collection.set(
              'fields',
              traverseFields(collection.get('fields'), setDefaultPublicFolder)
            )
            collection = collection.set('folder', trim(folder, '/'))
            if (collection.has('meta')) {
              const fields = collection.get('fields')
              const metaFields = []
              collection.get('meta').forEach((value, key) => {
                const field = value.withMutations((map) => {
                  map.set('name', key)
                  map.set('meta', true)
                  map.set('required', true)
                })
                metaFields.push(field)
              })
              collection = collection.set(
                'fields',
                fromJS([]).concat(metaFields, fields)
              )
            } else {
              collection = collection.set('meta', Map())
            }
          }

          const files = collection.get('files')
          if (files) {
            collection = collection.delete('nested')
            collection = collection.delete('meta')
            collection = collection.set(
              'files',
              files.map((file) => {
                file = file.set('file', trimStart(file.get('file'), '/'))
                file = setDefaultPublicFolder(file)
                file = file.set(
                  'fields',
                  traverseFields(file.get('fields'), setDefaultPublicFolder)
                )
                return file
              })
            )
          }

          if (!collection.has('view_filters')) {
            collection = collection.set('view_filters', fromJS([]))
          } else {
            collection = collection.set(
              'view_filters',
              collection
                .get('view_filters')
                .map((v) =>
                  v.set('id', `${v.get('field')}__${v.get('pattern')}`)
                )
            )
          }

          return collection
        })
      )
    })
}

export function parseConfig(data) {
  const config = yaml.parse(data, {
    maxAliasCount: -1,
    prettyErrors: true,
    merge: true,
  })

  return config
}
function mergePreloadedConfig(preloadedConfig, loadedConfig) {
  const map = fromJS(loadedConfig) || Map()
  return preloadedConfig ? preloadedConfig.mergeDeep(map) : map
}

async function getConfig(file) {
  const buff = await readFile(file).catch((err) => err)
  if (file instanceof Error) {
    throw new TypeError(`Failed to load config.yml (${buff})`)
  }

  return parseConfig(buff.toString())
}

export async function loadConfig(configPath) {
  const loadedConfig = await getConfig(configPath)

  const mergedConfig = mergePreloadedConfig(null, loadedConfig)

  validateConfig(mergedConfig.toJS())

  const config = applyDefaults(loadedConfig)

  return config
}
