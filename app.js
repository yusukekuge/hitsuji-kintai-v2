// ===== メインアプリケーション =====
const App = (() => {
  let isAdminAuthenticated = false;
  let currentScreen = 'clock';

  const screens = {
    clock: ClockScreen,
    'shift-view': ShiftViewScreen,
    dashboard: DashboardScreen,
    records: RecordsScreen,
    payroll: PayrollScreen,
    'shift-edit': ShiftEditScreen,
    staff: StaffScreen,
    settings: SettingsScreen
  };

  const adminScreens = ['dashboard', 'records', 'payroll', 'shift-edit', 'staff', 'settings'];

  function init() {
    setupNavigation();
    setupClock();
    setupMenuToggle();
    navigateTo('clock');
  }

  function setupClock() {
    function updateClock() {
      const el = document.getElementById('current-time');
      if (el) el.textContent = Utils.formatTime(new Date());
      const clockTime = document.getElementById('clock-time');
      if (clockTime) clockTime.textContent = Utils.formatTime(new Date());
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  function setupMenuToggle() {
    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('nav').classList.toggle('open');
    });
    document.getElementById('logo-btn').addEventListener('click', () => {
      navigateTo('clock');
    });
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.screen);
        document.getElementById('nav').classList.remove('open');
      });
    });
  }

  async function navigateTo(screenName) {
    if (adminScreens.includes(screenName) && !isAdminAuthenticated) {
      const pin = Storage.getPin();
      if (pin) {
        const authenticated = await showPinModal();
        if (!authenticated) return;
      }
      isAdminAuthenticated = true;
      document.querySelectorAll('.admin-link').forEach(l => l.classList.add('unlocked'));
    }

    currentScreen = screenName;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${screenName}`);
    if (el) el.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.screen === screenName);
    });

    const screen = screens[screenName];
    if (screen && screen.render) {
      try {
        await screen.render();
      } catch (e) {
        console.error(`Screen render error (${screenName}):`, e);
        Utils.showToast('画面の表示中にエラーが発生しました', 'error');
      }
    }
  }

  function showPinModal() {
    return new Promise(resolve => {
      const modal = document.getElementById('pin-modal');
      const input = document.getElementById('pin-input');
      const submit = document.getElementById('pin-submit');
      const cancel = document.getElementById('pin-cancel');
      const error = document.getElementById('pin-error');

      modal.classList.add('active');
      input.value = '';
      error.style.display = 'none';
      input.focus();

      function cleanup() {
        modal.classList.remove('active');
        submit.removeEventListener('click', onSubmit);
        cancel.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKeydown);
      }
      function onSubmit() {
        if (Storage.verifyPin(input.value)) { cleanup(); resolve(true); }
        else { error.style.display = 'block'; input.value = ''; input.focus(); }
      }
      function onCancel() { cleanup(); resolve(false); }
      function onKeydown(e) {
        if (e.key === 'Enter') onSubmit();
        if (e.key === 'Escape') onCancel();
      }

      submit.addEventListener('click', onSubmit);
      cancel.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKeydown);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { navigateTo };
})();
