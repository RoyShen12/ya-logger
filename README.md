# yet another node.js logger

# Usage

``` js
const logger = require('ya-node-logger')

// full function logger sample
logger.initNewLogger(
  /* logger name */ 'main',
  /* path of log file */ './log/',
  /* prefix of file name */ 'main-',
  /* suffix of file name */ '.log',
  /* compress old file to gz */ true,
  /* hook while writing log file */ (type, msg) => {
    if (msg.toString().length > 4000) {
      console.log(logger.logLevelToColor(type)('** message too long to show on console **'))
    }
    else {
      console.log(logger.logLevelToColor(type)(msg))
    }
  }
)

const mainLogger = logger.getLogger('main')

// <logLevel: string, logString: string, needTrace: boolean = false>
mainLogger('info', 'some log line.')

// console output
// 2019-01-01 10:10:00.000 INFO     some log line.

// dump fatal error sample
process.on('unhandledRejection', (reason, p) => {
  logger.dumpRawError(reason, 'global unhandledRejection, reason')
  logger.dumpRawError(p, 'global unhandledRejection, promise')
})
// detailed error info will write to (process pwd)/dumped-unexpected-error.txt
```
# log levels

- verbose
- debug
- success
- info
- notice
- warning
- error
- crit
- alert
- fatal
(alias)  
- err same as error
- suc same as success
- warn same as warning
- inf same as info
- information same as info
- dbg same as debug
