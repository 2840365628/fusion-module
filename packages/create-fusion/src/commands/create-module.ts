import { checkbox, input } from '@inquirer/prompts'
import path from 'node:path'
import fs from 'fs-extra'
import { red, green, cyan } from 'kolorist'
import Handlebars from 'handlebars'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** 模板目录:相对于本文件,dev(src/commands)与 build(build/esm)向上两级都指向包根 */
const templateDir = path.resolve(__dirname, '../../templates/module')

const validateCode = (value: string) => {
  if (!value.trim()) return '模块 code 不能为空'
  if (!/^[a-z][a-z0-9-]*$/.test(value)) return '模块 code 仅允许小写字母、数字和连字符,且以字母开头'
  return true
}

export const createModule = async () => {
  const moduleCode = await input({
    message: '请输入模块 code(目录名,如 drug-warehouse)',
    validate: validateCode,
  })

  const moduleName = await input({
    message: '请输入模块名称(展示名)',
    validate: (value) => (value.trim() ? true : '模块名称不能为空'),
  })

  const thirdPartyLibs = await checkbox({
    message: '请选择模块需要的第三方库(Vue、Vue Query 必选)',
    choices: [
      { name: 'Vue', value: 'vue', checked: true, disabled: '必选' },
      { name: 'Vue Query', value: 'vueQuery', checked: true, disabled: '必选' },
      { name: 'Element Plus', value: 'elementPlus' },
      { name: 'Ele Admin Plus', value: 'eleAdminPlus' },
      { name: 'Vxe Table', value: 'vxeTable' },
    ],
  })

  // 生成到 用户执行命令所在目录 的 modules/<code>
  const rootDir = process.cwd()
  const targetDir = path.resolve(rootDir, 'modules', moduleCode)

  if (await fs.pathExists(targetDir)) {
    console.log(red(`模块已存在: ${targetDir}`))
    process.exit(1)
  }

  const templateData = {
    moduleCode,
    moduleName,
    useVue: thirdPartyLibs.includes('vue'),
    useVueQuery: thirdPartyLibs.includes('vueQuery'),
    useElementPlus: thirdPartyLibs.includes('elementPlus'),
    useEleAdminPlus: thirdPartyLibs.includes('eleAdminPlus'),
    useVxeTable: thirdPartyLibs.includes('vxeTable'),
  }

  await fs.ensureDir(targetDir)

  const files = await getTemplateFiles(templateDir)

  for (const file of files) {
    const relativePath = path.relative(templateDir, file)
    const targetPath = path.resolve(targetDir, relativePath.replace(/\.hbs$/, ''))

    const content = await fs.readFile(file, 'utf-8')
    const rendered = Handlebars.compile(content, { noEscape: true })(templateData)

    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, rendered)
  }

  console.log(green(`模块创建成功: ${path.relative(rootDir, targetDir) || targetDir}`))

  console.log(
    cyan(
      `\n下一步:\n  pnpm install\n  cd ${path.relative(rootDir, targetDir) || targetDir}\n  pnpm build\n`,
    ),
  )
}

const getTemplateFiles = async (dir: string): Promise<string[]> => {
  const result: string[] = []
  const items = await fs.readdir(dir)

  for (const item of items) {
    const fullPath = path.resolve(dir, item)
    const stat = await fs.stat(fullPath)

    if (stat.isDirectory()) {
      result.push(...(await getTemplateFiles(fullPath)))
    } else {
      result.push(fullPath)
    }
  }

  return result
}
