try {
  Error.stackTraceLimit = 20
} catch (e) {}

const fs = require('fs')
const util = require('util')

const _ = require('lodash')
const chalk = require('chalk').default

const zlb = require('./ziptool')

function timebasedFileNamer() {
  const DateObj = new Date()
  const month = DateObj.getMonth() < 9 ? ('0' + (DateObj.getMonth() + 1)) : (DateObj.getMonth() + 1)
  const day = DateObj.getDate() < 10 ? ('0' + DateObj.getDate()) : DateObj.getDate()
  return DateObj.getFullYear() + '-' + month + '-' + day
}

const getTraceInfo = (fx) => {
  const obj = {}
  Error.captureStackTrace(obj, fx || getTraceInfo)
  return obj.stack
}

/**
 * @typedef {keyof logLevel} LogType
 */

/**
 * @type {Map<string, (type: LogType, message: string, trace: boolean = false) => void>}
 */
const loggersCached = new Map()

/**
 * @type {Map<string, string[]>}
 */
const filesOfLogger = new Map() // only store unziped files

const logLevel = new Proxy({
  verbose:  'VERBOSE ',       // -1 各种冗长而不重要的输出
  debug:    'DEBUG   ',       // 0 调试信息的日志，日志信息最多
  suc:      'SUCCESS ',       // 1 重要的运行时成功信息
  info:     'INFO    ',       // 2 一般信息的日志，最常用
  notice:   'NOTICE  ',       // 3 最具有重要性的普通条件的信息
  warn:     'WARNING ',       // 4 警告级别
  err:      'ERROR   ',       // 5 错误级别，阻止某个功能或者模块不能正常工作的信息
  crit:     'CRIT    ',       // 6 严重级别，阻止整个系统或者整个软件不能正常工作的信息
  alert:    'ALERT   ',       // 7 需要立刻修改的信息
  fatal:    'FATAL   ',       // 8 崩溃等严重信息
  get error() { return this.err },
  get success() { return this.suc },
  get warning() { return this.warn },
  get inf() { return this.info },
  get information() { return this.info },
  get dbg() { return this.debug }
}, {
  get: function (target, property, receiver) {
    return Reflect.get(target, property, receiver) || target.info
  }
})

const levelNumberMap = new Map([
  ['VERBOSE ', -1],
  ['DEBUG   ', 0],
  ['SUCCESS ', 1],
  ['INFO    ', 2],
  ['NOTICE  ', 3],
  ['WARNING ', 4],
  ['ERROR   ', 5],
  ['CRIT    ', 6],
  ['ALERT   ', 7],
  ['FATAL   ', 8]
])

const levelColorMap = new Map([
  [-1, chalk.gray],
  [0, chalk.white],
  [1, chalk.greenBright],
  [2, chalk.whiteBright],
  [3, chalk.blueBright],
  [4, chalk.yellowBright],
  [5, chalk.redBright],
  [6, chalk.bgYellowBright],
  [7, chalk.bgMagentaBright],
  [8, chalk.bgRedBright]
])

/**
 * @param {string} level
 */
const logLevelToColor = level => levelColorMap.get(levelNumberMap.get(logLevel[level]))

function timeBasedLogHead(bc) {
  const DateObj = new Date()
  const year = DateObj.getFullYear()
  const month = ((DateObj.getMonth() + 1) + '').padStart(2, '0')
  const day = (DateObj.getDate() + '').padStart(2, '0')
  const hour = (DateObj.getHours() + '').padStart(2, '0')
  const minute = (DateObj.getMinutes() + '').padStart(2, '0')
  const second = (DateObj.getSeconds() + '').padStart(2, '0')
  const msecond = (DateObj.getMilliseconds() + '').padStart(3, '0')
  let blank = ''.padEnd(bc)
  return `${blank}${year}-${month}-${day} ${hour}:${minute}:${second}.${msecond}`
}

/**
 * @param {string} loggerName
 * @param {string} logfilePath
 * @param {string} logFileNameHead
 * @param {string} logFileNameTail
 * @param {boolean} zipOldFiles
 * @param {(type: LogType, logLine: string) => void | () => void} onLoggingHook
 * @returns {void}
 */
function initNewLogger(loggerName, logfilePath, logFileNameHead, logFileNameTail = '.log', zipOldFiles = true, onLoggingHook = () => {}) {

  if (loggerName === 'debug') return null

  if (loggersCached.has(loggerName)) return null

  if (zipOldFiles) fs.existsSync(logfilePath + 'lagecy') || fs.mkdirSync(logfilePath + 'lagecy', { recursive: true })
  else fs.existsSync(logfilePath) || fs.mkdirSync(logfilePath, { recursive: true })

  filesOfLogger.set(loggerName, []) // init file record map

  if (zipOldFiles) { // task on
    const archiveFunc = async () => {
      // console.log('archive func enter, logger name: ' + loggerName)
      // 这里的作用是尝试把除了正在写入的文件以外的陈旧日志压缩到 ./lagecy/*.gz 归档，然后删除原文件
      // 文本文件被压缩后可以大幅节省空间
      const fList = Array.from(filesOfLogger.get(loggerName))
      const nowFileName = fList.pop()  // pop the newest file which is in use
      filesOfLogger.set(loggerName, [nowFileName])
      // 读取、压缩、归档和删除都使用异步
      for (const oldFileName of fList) {
        try {
          if (!fs.existsSync(oldFileName)) {
            continue
          }
          const oldFileBuffer = await fs.promises.readFile(oldFileName)
          const [gZipedOldFileBuffer] = await Promise.all([
            zlb.standardZipAsync(oldFileBuffer),
            fs.promises.unlink(oldFileName)
          ])

          // ./log/verbose-2019-08-12.log -> ./log/lagecy/verbose-2019-08-12.log.gz
          const destination = logfilePath + 'lagecy/' + _.trimStart(oldFileName, logfilePath) + '.gz'
          await fs.promises.writeFile(destination, gZipedOldFileBuffer)
        } catch (err) {
          dumpRawError(err, `logger, caught while old file being archived, target file symbol: ${fList}`)
        }
      }
    }
    setInterval(archiveFunc, 600000) // 周期性检查是否存在可压缩的日志文件
    // setInterval(archiveFunc, 5000) // debug
  }

  function fileNameGenerator() {
    const fileName = logfilePath + logFileNameHead + timebasedFileNamer() + logFileNameTail

    if (filesOfLogger.get(loggerName).findIndex(fpath => fpath === fileName) === -1) {
      filesOfLogger.get(loggerName).push(fileName)
    }
    return fileName
  }

  function _inner_logger_(type, message, trace = false) {

    const timeH = timeBasedLogHead()

    const logLine = trace ?
      (timeH + '  ' + logLevel[type] + '  ' + message.toString() + '\n' + getTraceInfo(_inner_logger_)) :
      (timeH + '  ' + logLevel[type] + '  ' + message.toString())

    setTimeout(onLoggingHook, 0, type, logLine)

    setTimeout(() => {
      const fn = fileNameGenerator()
      const pureLogLine = logLine.replace(/\u001b\[\d{1,2}m/g, '') + '\n'

      fs.writeFile(fn, pureLogLine, { flag: 'a+' }, err => {
        if (err) return dumpRawError(err, `unexpected error while logger [${loggerName}] writing to file ${fn}`)
      })
    }, 0)
  }

  loggersCached.set(loggerName, _inner_logger_)
}

/**
 * - 暴露给外部的获取 Logger 的函数
 * - 如果无 [loggerName] 对应的 Logger
 * - 则回退到 console.log
 * @param {string} loggerName
 * @returns {(type: LogType, message: string, trace?: boolean) => void}
 */
const getLogger = loggerName => loggersCached.get(loggerName) || ((...args) => console.log(...args))

const pLine = '####################################################################################################'

/**
 * - 记录意料外的/严重的错误
 * - 将错误信息的具体对象或其他对象记录到文件
 * @param {Error} error
 * @param {string} name
 */
function dumpRawError(error, name, deepth = 3) {
  let namePad = parseInt((100 - name.length) / 2)
  if (namePad < 0) namePad = 0
  fs.writeFile(
    './dumped-unexpected-error.txt',
    '\n\n' + pLine + '\n\n' + timeBasedLogHead(40) + '\n' + ''.padStart(namePad) + name + '\n\n' + util.inspect(error, true, deepth, false) + '\n\n\n',
    { flag: 'a+' },
    new Function
  )
}

const initCleaning = _.once(function () {
  const logDir = './log/'
  const fsList = fs.readdirSync(logDir)
  const todayFileName = timebasedFileNamer()

  for (const f of fsList) {
    if (f === 'lagecy') {
      void 0
    }
    else {
      if (f.indexOf(todayFileName) === -1 && !/.*\.gz/.test(f)) {

        const buf = fs.readFileSync(logDir + f)
        const bufZ = zlb.standardZip(buf)
        fs.writeFileSync(`${logDir}lagecy/${f}.gz`, bufZ)
        fs.unlinkSync(logDir + f)
      }
      else if (/.*\.gz/.test(f)) {
        fs.renameSync(logDir + f, `${logDir}lagecy/${f}`)
      }
    }
  }
})

initCleaning()

module.exports = {
  initNewLogger,
  getLogger,
  dumpRawError,
  logLevelToColor
}
