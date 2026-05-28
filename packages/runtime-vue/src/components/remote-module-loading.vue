<template>
  <div class="loader">
    <svg id="cloud" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <filter id="roundness">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5"></feGaussianBlur>
          <feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -10"></feColorMatrix>
        </filter>
        <mask id="shapes">
          <g fill="white">
            <polygon points="50 37.5 80 75 20 75 50 37.5"></polygon>
            <circle cx="20" cy="60" r="15"></circle>
            <circle cx="80" cy="60" r="15"></circle>
            <g>
              <circle cx="20" cy="60" r="15"></circle>
              <circle cx="20" cy="60" r="15"></circle>
              <circle cx="20" cy="60" r="15"></circle>
            </g>
          </g>
        </mask>
        <mask id="clipping" clipPathUnits="userSpaceOnUse">
          <g id="lines" filter="url(#roundness)">
            <g mask="url(#shapes)" stroke="white">
              <line x1="-50" y1="-40" x2="150" y2="-40"></line>
              <line x1="-50" y1="-31" x2="150" y2="-31"></line>
              <line x1="-50" y1="-22" x2="150" y2="-22"></line>
              <line x1="-50" y1="-13" x2="150" y2="-13"></line>
              <line x1="-50" y1="-4" x2="150" y2="-4"></line>
              <line x1="-50" y1="5" x2="150" y2="5"></line>
              <line x1="-50" y1="14" x2="150" y2="14"></line>
              <line x1="-50" y1="23" x2="150" y2="23"></line>
              <line x1="-50" y1="32" x2="150" y2="32"></line>
              <line x1="-50" y1="41" x2="150" y2="41"></line>
              <line x1="-50" y1="50" x2="150" y2="50"></line>
              <line x1="-50" y1="59" x2="150" y2="59"></line>
              <line x1="-50" y1="68" x2="150" y2="68"></line>
              <line x1="-50" y1="77" x2="150" y2="77"></line>
              <line x1="-50" y1="86" x2="150" y2="86"></line>
              <line x1="-50" y1="95" x2="150" y2="95"></line>
              <line x1="-50" y1="104" x2="150" y2="104"></line>
              <line x1="-50" y1="113" x2="150" y2="113"></line>
              <line x1="-50" y1="122" x2="150" y2="122"></line>
              <line x1="-50" y1="131" x2="150" y2="131"></line>
              <line x1="-50" y1="140" x2="150" y2="140"></line>
            </g>
          </g>
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="0" ry="0" mask="url(#clipping)"></rect>
    </svg>
  </div>
</template>

<style scoped>
.loader {
  --cloud-color: #4387f4;
  --arrows-color: #80b1ff;
  --time-animation: 1s;
  transform: scale(1); /* You can change the size */
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ebeef5;
  background-color: #fafafa;
  border-radius: 6px;
}

.loader #cloud {
  width: 100px;
  height: 100px;
}

.loader #cloud rect {
  fill: var(--cloud-color);
}

.loader #cloud g:nth-child(3) {
  transform-origin: 50% 72.8938%;
  fill: var(--arrows-color);
  filter: drop-shadow(0 0 8px black);
  animation: rotation var(--time-animation) linear infinite;
}

.loader #shapes g g circle {
  animation: cloud calc(var(--time-animation) * 2) linear infinite;
}

.loader #shapes g g circle:nth-child(2) {
  animation-delay: calc((var(--time-animation) * 2) / -3);
}

.loader #shapes g g circle:nth-child(3) {
  animation-delay: calc((var(--time-animation) * 2) / -1.5);
}

.loader svg #lines g line {
  stroke-width: 5;
  transform-origin: 50% 50%;
  rotate: -65deg;
  animation: lines calc(var(--time-animation) / 1.33) linear infinite;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(180deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes lines {
  0% {
    transform: translateY(-10px);
  }
  100% {
    transform: translateY(8px);
  }
}

@keyframes cloud {
  0% {
    cx: 20;
    cy: 60;
    r: 15;
  }
  50% {
    cx: 50;
    cy: 45;
    r: 20;
  }
  100% {
    cx: 80;
    cy: 60;
    r: 15;
  }
}
</style>
