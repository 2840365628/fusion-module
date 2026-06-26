import { red, bold } from 'kolorist'
import { createModule } from './commands/create-module'

const command = process.argv[2]

const printHelp = () => {
  console.log(`
${bold('create-fusion')} — fusion-module 脚手架

用法:
  pnpm create @fusion-module/fusion <command>

命令:
  module    生成一个新的远程模块到 当前目录/modules/<code>
`)
}

if (command === 'module') {
  await createModule()
} else if (command === '-h' || command === '--help' || command === undefined) {
  printHelp()
} else {
  console.log(red(`未知命令: ${command}`))
  printHelp()
  process.exit(1)
}
