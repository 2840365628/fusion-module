const styleLoadTasks = new Map<string, Promise<void>>()

const createStyleSelector = (url: string) => {
  return `link[data-platform-runtime-style="${url}"]`
}

export const loadStyle = async (url?: string) => {
  if (!url) return

  const existingTask = styleLoadTasks.get(url)
  if (existingTask) return existingTask

  const task = new Promise<void>((resolve, reject) => {
    const existingManagedLink = document.querySelector<HTMLLinkElement>(createStyleSelector(url))
    if (existingManagedLink) {
      const alreadyLoaded = existingManagedLink.dataset.loaded === 'true'
      if (alreadyLoaded) {
        resolve()
        return
      }

      existingManagedLink.addEventListener('load', () => resolve(), { once: true })
      existingManagedLink.addEventListener(
        'error',
        () => reject(new Error(`Failed to load module style: ${url}`)),
        { once: true },
      )
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.dataset.platformRuntimeStyle = url

    link.addEventListener(
      'load',
      () => {
        link.dataset.loaded = 'true'
        resolve()
      },
      { once: true },
    )
    link.addEventListener(
      'error',
      () => {
        link.remove()
        reject(new Error(`Failed to load module style: ${url}`))
      },
      { once: true },
    )

    document.head.appendChild(link)
  })

  styleLoadTasks.set(url, task)

  try {
    await task
  } catch (error) {
    styleLoadTasks.delete(url)
    throw error
  }
}
