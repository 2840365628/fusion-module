export interface ModuleContract {
  /** 写入共享状态（ModuleState.set）的 key */
  provides?: string[]
  /** 必需的共享状态 key：没有模块提供时，本模块无法正常工作 */
  requires?: string[]
  /** 可选的共享状态 key：有则使用，没有也不影响工作 */
  optional?: string[]
  /** 通过事件总线（ModuleEventBus.emit）发出的事件 */
  emits?: string[]
  /** 通过事件总线（ModuleEventBus.on）监听的事件 */
  listens?: string[]
}
