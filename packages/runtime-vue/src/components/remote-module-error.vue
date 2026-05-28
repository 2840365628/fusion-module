<template>
  <div class="remote-module-error">
    <div class="remote-module-error__icon" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18"></circle>
        <path d="M24 14v13"></path>
        <path d="M24 34h.01"></path>
      </svg>
    </div>
    <div class="remote-module-error__content">
      <p class="remote-module-error__title">模块加载失败</p>
    </div>
  </div>
</template>

<style scoped>
.remote-module-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 120px;
  border: 1px solid #f1d3d0;
  border-radius: 6px;
  background-color: #fffafa;
  color: #8f2f2a;
}

.remote-module-error__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background-color: #fff1f0;
}

.remote-module-error__icon svg {
  width: 24px;
  height: 24px;
}

.remote-module-error__icon circle {
  fill: none;
  stroke: #d84c43;
  stroke-width: 3;
}

.remote-module-error__icon path {
  fill: none;
  stroke: #d84c43;
  stroke-linecap: round;
  stroke-width: 3;
}

.remote-module-error__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.remote-module-error__title,
.remote-module-error__description {
  margin: 0;
}

.remote-module-error__title {
  font-size: 14px;
  font-weight: 600;
}
</style>
