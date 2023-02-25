const match = require('minimatch')
const evaluate = require('./eval')

// 经过ask回去用户需求后 => metadata => 过滤不需要的模板文件

// files - 模板内所有文件
// filters meta.js / meta.json 过滤字段
// data Metalsmith.meta()

module.exports = (files, filters, data, done) => {
  if (!filters) {
    return done()
  }
  const fileNames = Object.keys(files)
  Object.keys(filters).forEach(glob => {
    fileNames.forEach(file => {
      if (match(file, glob, { dot: true })) {
        const condition = filters[glob]
        if (!evaluate(condition, data)) {
          delete files[file]
        }
      }
    })
  })
  done()
}
