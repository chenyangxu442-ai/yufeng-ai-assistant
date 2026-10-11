// 与风AI助手 site — scenario tabs (ARIA pattern, keyboard navigable).
(function () {
  var demo = document.querySelector('[data-demo]');
  if (!demo) return;
  var tabs = Array.prototype.slice.call(demo.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(demo.querySelectorAll('[role="tabpanel"]'));

  function activate(i, focus) {
    tabs.forEach(function (t, n) {
      var on = n === i;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[n].classList.toggle('is-active', on);
      panels[n].hidden = !on;
    });
    if (focus) tabs[i].focus();
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { activate(i, false); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowRight' || k === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); activate(n, true); }
    });
  });
})();
