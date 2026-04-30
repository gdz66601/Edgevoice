// Liquid Glass Interactive Effects
export function initLiquidGlass() {
  // 为所有带有 liquid-glass 类的元素添加鼠标跟踪
  const liquidElements = document.querySelectorAll('.ui-surface, .chat-bubble, .liquid-glass-panel');

  liquidElements.forEach(element => {
    element.addEventListener('mousemove', (e) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      element.style.setProperty('--m-x', `${x}px`);
      element.style.setProperty('--m-y', `${y}px`);
    });

    element.addEventListener('mouseleave', () => {
      element.style.setProperty('--m-x', '50%');
      element.style.setProperty('--m-y', '50%');
    });
  });
}

// 在 DOM 加载完成后初始化
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initLiquidGlass);

  // 支持动态添加的元素
  const observer = new MutationObserver(() => {
    initLiquidGlass();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
