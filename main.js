import path from 'path'
import camelCase from 'camelcase'
import yaml from 'yaml'
import { loadConfig as loadNetlifyConfigFile } from './config'
import ListWidget from './widgets/list'
import Widget from './widgets/widget'
import MarkdownWidget from './widgets/markdown'
import ImageWidget from './widgets/image'
import FileWidget from './widgets/file'
import { isSupportedMime } from './constants/plugin'

const crypto = require('crypto')
const fs = require('fs-extra')
const slash = require('slash')
const mime = require('mime-types')
const { trim, trimEnd } = require('lodash')

const isDev = process.env.NODE_ENV === 'development'

class NetlifyCmsSource {
  static defaultOptions() {
    return {
      baseDir: undefined,
      path: undefined,
      configPath: 'src/admin/config.yml',
      index: ['index'],
      route: undefined,
      pathPrefix: undefined,
      typeName: 'Netlify',
    }
  }

  constructor(api, options) {
    this.api = api
    this.options = options
    this.context = options.baseDir ? api.resolve(options.baseDir) : api.context
    this.configPath = path.join(this.context, this.options.configPath)
    this.collections = new Map()

    api.loadSource(async (actions) => {
      this.netlifyConfig = await this.loadConfig(this.configPath)
      api.chainWebpack((config) => {
        config.resolve.alias.set(
          '@netlifyMedia',
          path.join(this.context, this.netlifyConfig.get('media_folder'))
        )
      })
      this.createCollections(actions)
      await this.createNodes(actions)
      if (isDev) this.watchFiles(actions)
    })
  }

  async loadConfig(configPath) {
    return await loadNetlifyConfigFile(configPath)
  }

  createCollections(actions) {
    const addCollection = actions.addCollection || actions.addContentType

    for (const collection of this.netlifyConfig.get('collections')) {
      if (collection.has('files')) {
        for (const file of collection.get('files')) {
          const typeName = this.createTypeName(
            `${collection.get('name')} ${file.get('name')}`
          )
          this.collections.set(file.get('file'), {
            nodeCollection: addCollection({
              typeName,
              // route: this.options.route,
            }),
            props: file,
            typeName,
            isFile: true,
          })
        }
      } else {
        const typeName = this.createTypeName(collection.get('name'))
        this.collections.set(this.getFolderGlob(collection.get('folder')), {
          nodeCollection: addCollection({
            typeName,
            // route: this.options.route,
          }),
          props: collection,
          typeName,
        })
      }
    }
  }

  async transformNodeFiles(collection, actions) {
    const node = collection.props.toJS()
    node.files = []
    const file = collection.props
    const { dir, name } = path.parse(file.get('file'))
    const mimeType = mime.lookup(file.get('file'))
    if (!isSupportedMime(mimeType)) {
      throw new Error(`${mimeType} is not supported for file parsing`)
    }
    const content =
      mimeType === 'application/json'
        ? await fs.readJson(path.join(this.context, file.get('file')))
        : yaml.parse((await fs.readFile()).toString(), {
            maxAliasCount: -1,
            prettyErrors: true,
            merge: true,
          })
    return {
      ...file.toJS(),
      path: this.createPath({ dir, name }, actions),
      data: await this.parseFields(
        content,
        file.get('fields'),
        collection.nodeCollection
      ),
    }
  }

  async parseFields(content, fields, collection, path = '') {
    const parsedFields = {}
    for (const field of fields) {
      const widget = this.getWidget(field, collection)
      parsedFields[field.get('name')] = await widget.parse(content)
    }
    return parsedFields
  }

  getWidget(field, collection) {
    switch (field.get('widget')) {
      case 'list':
        return new ListWidget(this, field, collection)
      case 'markdown':
        return new MarkdownWidget(this, field, collection)
      case 'image':
        return new ImageWidget(this, field, collection)
      case 'file':
        return new FileWidget(this, field, collection)
      default:
        return new Widget(this, field, collection)
    }
  }

  async createNodes(actions) {
    for (const collection of this.collections.values()) {
      if (collection.isFile) {
        const options = await this.createNodeFileOptions(
          await this.transformNodeFiles(collection, actions)
        )
        collection.nodeCollection.addNode(options)
      } else {
        const glob = require('globby')

        const files = await glob(
          this.getFolderGlob(collection.props.get('folder')),
          { cwd: this.context }
        )

        await Promise.all(
          files.map(async (file) => {
            const options = await this.createNodeOptions(file, actions)
            collection.nodeCollection.addNode(options)
          })
        )
      }
    }
  }

  watchFiles(actions) {
    const chokidar = require('chokidar')

    const configWatcher = chokidar.watch(this.configPath, {
      cwd: this.context,
      ignoreInitial: true,
    })

    configWatcher.on('change', async (file) => {
      for (const collection of this.collections.values()) {
        collection.nodeCollection.data().forEach((node) => {
          collection.nodeCollection.removeNode(node.id)
        })
      }
      this.createCollections(actions)
      await this.createNodes(actions)
    })

    const watcher = chokidar.watch(Array.from(this.collections.keys()), {
      cwd: this.context,
      ignoreInitial: true,
    })

    watcher.on('add', async (file) => {
      const collection =
        this.collections.get(file) ||
        this.collections.get(this.getFolderGlob(path.dirname(file)))
      if (collection && !collection.isFile) {
        const options = await this.createNodeOptions(slash(file), actions)
        collection.nodeCollection.addNode(options)
      }
    })

    watcher.on('unlink', (file) => {
      const collection =
        this.collections.get(file) ||
        this.collections.get(this.getFolderGlob(path.dirname(file)))
      if (collection && !collection.isFile) {
        const absPath = path.join(this.context, slash(file))
        collection.nodeCollection.removeNode({
          'internal.origin': absPath,
        })
      }
    })

    watcher.on('change', async (file) => {
      const collection =
        this.collections.get(file) ||
        this.collections.get(this.getFolderGlob(path.dirname(file)))
      if (collection) {
        if (!collection.isFile) {
          const options = await this.createNodeOptions(slash(file), actions)
          collection.nodeCollection.updateNode(options)
        } else {
          const options = await this.createNodeFileOptions(
            await this.transformNodeFiles(collection, actions)
          )
          collection.nodeCollection.updateNode(options)
        }
      }
    })
  }

  // helpers
  createNodeFileOptions(node) {
    node.id = this.createUid(node.name)
    return node
  }

  async createNodeOptions(file, actions) {
    const relPath = path.relative(this.context, file)
    const origin = path.join(this.context, file)
    const content = await fs.readFile(origin, 'utf8')
    const { dir, name, ext = '' } = path.parse(file)
    const mimeType =
      mime.lookup(file) || `application/x-${ext.replace('.', '')}`

    return {
      id: this.createUid(relPath),
      path: this.createPath({ dir, name }, actions),
      fileInfo: {
        extension: ext,
        directory: dir,
        path: file,
        name,
      },
      internal: {
        mimeType,
        content,
        origin,
      },
    }
  }

  createPath({ dir, name }, actions) {
    const { permalinks = {} } = this.api.config
    const pathPrefix = trim(this.options.pathPrefix, '/')
    const pathSuffix = permalinks.trailingSlash ? '/' : ''

    const segments = slash(dir)
      .split('/')
      .map((segment) => {
        return actions.slugify(segment)
      })

    if (!this.options.index.includes(name)) {
      segments.push(actions.slugify(name))
    }

    if (pathPrefix) {
      segments.unshift(pathPrefix)
    }

    const res = trimEnd('/' + segments.filter(Boolean).join('/'), '/')

    return res + pathSuffix || '/'
  }

  createUid(orgId) {
    return crypto.createHash('md5').update(orgId).digest('hex')
  }

  transformNodeContent(content, mimeType, collection) {
    const { _mimeTypes } = collection
    const transformer = collection._transformers[mimeType]
    if (!transformer) {
      throw new Error(`No transformer for '${mimeType}' is installed.`)
    }

    // add transformer to content type to let it
    // extend the node type when creating schema
    if (
      mimeType &&
      !Object.prototype.hasOwnProperty.call(_mimeTypes, mimeType)
    ) {
      _mimeTypes[mimeType] = transformer
    }
    return content ? transformer.parse(content) : {}
  }

  createTypeName(name = '') {
    return camelCase(`${this.options.typeName} ${name}`, { pascalCase: true })
  }

  getFolderGlob(folder) {
    return path.join(folder, '/*.*')
  }
}

module.exports = NetlifyCmsSource
