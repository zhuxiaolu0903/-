// 依赖加载
const chalk = require('chalk')
// 静态网页生成
const Metalsmith = require('metalsmith')
// 模板引擎
const Handlebars = require('handlebars')
// 异步处理工具
const async = require('async')
// 模板引擎里解析渲染器
const render = require('consolidate').handlebars.render
const path = require('path')
// 多个条件匹配
const multimatch = require('multimatch')
const getOptions = require('./options')
const ask = require('./ask')
const filter = require('./filter')
const logger = require('./logger')
const { handlebars } = require('consolidate')

// register handlebars helper

// handlebars挂载
Handlebars.registerHelper('if_eq', function (a, b, opts) {
  return a === b
    ? opts.fn(this)
    : opts.inverse(this)
})

Handlebars.registerHelper('unless_eq', function (a, b, opts) {
  return a === b
    ? opts.inverse(this)
    : opts.fn(this)
})

/**
 * Generate a template given a `src` and `dest`.
 *
 * @param {String} name
 * @param {String} src
 * @param {String} dest
 * @param {Function} done
 */
// 1. 获取完全体配置 2. 实例化、before、after、complete 3. 完成结束
module.exports = function generate (name, src, dest, done) {
  // 读取配置项
  const opts = getOptions(name, src)

  // metalsmith初始化数据
  const metalsmith = Metalsmith(path.join(src, 'template'))
  // 配置项完全体合并
  const data = Object.assign(metalsmith.metadata(), {
    destDirName: name,
    inPlace: dest === process.cwd(),
    noEscape: true
  })
  // 注册配置的对象 - 动态组件可以学习这种方式
  opts.helpers && Object.keys(opts.helpers).map(key => {
    Handlebars.registerHelper(key, opts.helpers[key])
  })

  const helpers = { chalk, logger }

  // 调用before钩子
  if (opts.metalsmith && typeof opts.metalsmith.before === 'function') {
    opts.metalsmith.before(metalsmith, opts, helpers)
  }

  // 问询
  metalsmith.use(askQuestions(opts.prompts))
    .use(filterFiles(opts.filters)) // 过滤项配置过滤
    .use(renderTemplateFiles(opts.skipInterpolation)) // 渲染


  // 直接执行（ms为函数直接执行）
  // 配置after函数的执行逻辑
  if (typeof opts.metalsmith === 'function') {
    opts.metalsmith(metalsmith, opts, helpers)
  } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
    opts.metalsmith.after(metalsmith, opts, helpers)
  }

  // 结尾
  metalsmith.clean(false)
    .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
    .destination(dest)
    .build((err, files) => {
      done(err)
      // complete钩子
      if (typeof opts.complete === 'function') {
        const helpers = { chalk, logger, files }
        opts.complete(data, helpers)
      } else {
        // 完成message
        logMessage(opts.completeMessage, data)
      }
    })

  return data
}

/**
 * Create a middleware for asking questions.
 *
 * @param {Object} prompts
 * @return {Function}
 */

function askQuestions (prompts) {
  return (files, metalsmith, done) => {
    ask(prompts, metalsmith.metadata(), done)
  }
}

/**
 * Create a middleware for filtering files.
 *
 * @param {Object} filters
 * @return {Function}
 */

function filterFiles (filters) {
  return (files, metalsmith, done) => {
    filter(files, filters, metalsmith.metadata(), done)
  }
}

/**
 * Template in place plugin.
 *
 * @param {Object} files
 * @param {Metalsmith} metalsmith
 * @param {Function} done
 */
// 1. 文件索引处理 2. 跳过要跳过的，取出内容字符串 3. 内容结合元数据 做渲染
function renderTemplateFiles (skipInterpolation) {
  // 确保是数组
  skipInterpolation = typeof skipInterpolation === 'string'
    ? [skipInterpolation]
    : skipInterpolation
  return (files, metalsmith, done) => {
    // 获取索引
    const keys = Object.keys(files)
    // 获取ms元数据
    const metalsmithMetadata = metalsmith.metadata()
    async.each(keys, (file, next) => {
      // 进入异步处理每一个文件
      // skipping files with skipInterpolation option
      if (skipInterpolation && multimatch([file], skipInterpolation, { dot: true }).length) {
        return next()
      }

      // 内容字符串
      const str = files[file].contents.toString()
      // do not attempt to render files that do not have mustaches
      if (!/{{([^{}]+)}}/g.test(str)) {
        return next()
      }

      // 渲染文件
      render(str, metalsmithMetadata, (err, res) => {
        if (err) {
          err.message = `[${file}] ${err.message}`
          return next(err)
        }
        files[file].contents = new Buffer(res)
        next()
      })
    }, done)
  }
}

/**
 * Display template complete message.
 *
 * @param {String} message
 * @param {Object} data
 */

function logMessage (message, data) {
  if (!message) return
  render(message, data, (err, res) => {
    if (err) {
      console.error('\n   Error when rendering template complete message: ' + err.message.trim())
    } else {
      console.log('\n' + res.split(/\r?\n/g).map(line => '   ' + line).join('\n'))
    }
  })
}
