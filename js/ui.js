// ui.js — HTML DOM manipulation and Event Binding
export const UI = {
  elements: {},
  handlers: {},

  init(handlers) {
    this.handlers = handlers;
    this.elements = {
      dropdown: document.getElementById('logo-dropdown'),
      appTitleContainer: document.getElementById('app-title-container'),
      dropdownCaret: document.querySelector('.dropdown-caret'),
      btnRestart: document.getElementById('btn-restart'),
      btnMode: document.getElementById('btn-mode'),
      btnStats: document.getElementById('btn-stats'),
      undoBtn: document.getElementById('btn-undo-floating'),
      undoMenu: document.getElementById('undo-menu'),
      undoList: document.getElementById('undo-list'),
      timeDisplay: document.getElementById('time-display'),
      movesDisplay: document.getElementById('moves-display'),
      seedDisplay: document.getElementById('seed-display'),
      seedValue: document.getElementById('seed-value'),
      seedInput: document.getElementById('seed-input')
    };

    this.bindEvents();
  },

  bindEvents() {
    // Top Left Menu
    this.elements.appTitleContainer?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.elements.dropdown?.classList.toggle('hidden');
      if (this.elements.dropdownCaret) {
        this.elements.dropdownCaret.style.transform = this.elements.dropdown?.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });

    // Close Dropdown on outside click
    window.addEventListener('click', (e) => {
      if (this.elements.dropdown && !this.elements.dropdown.contains(e.target) && this.elements.appTitleContainer && !this.elements.appTitleContainer.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Menu Buttons
    this.elements.btnRestart?.addEventListener('click', () => {
      this.closeDropdown();
      this.handlers.onRestart();
    });

    this.elements.btnMode?.addEventListener('click', () => {
      this.closeDropdown();
      this.handlers.onToggleMode();
    });

    this.elements.btnStats?.addEventListener('click', () => {
      this.closeDropdown();
      this.handlers.onToggleStats();
    });

    // Undo Floating UI Logic
    let undoTimer = null;
    let undoLongPressed = false;

    const showUndoMenu = () => {
      undoLongPressed = true;
      this.elements.undoList.innerHTML = '';
      
      const history = this.handlers.getHistory();
      if (!history || history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-btn';
        empty.style.color = '#888';
        empty.style.cursor = 'default';
        empty.innerText = 'No history available';
        this.elements.undoList.appendChild(empty);
      } else {
        // Show newest first
        for (let i = history.length - 1; i >= 0; i--) {
          const item = history[i];
          const btn = document.createElement('button');
          btn.className = 'dropdown-btn';
          btn.innerHTML = `<span class="icon">↶</span> ${item.actionDesc || 'Previous State'} <span style="font-size: 10px; color: #888; margin-left: auto;">[${item.moves}]</span>`;
          btn.onclick = (e) => {
            e.stopPropagation();
            this.handlers.onUndoTo(i);
            this.elements.undoMenu.classList.add('hidden');
          };
          this.elements.undoList.appendChild(btn);
        }
      }
      this.elements.undoMenu.classList.remove('hidden');
      this.handlers.onOverlayOpened();
    };

    const handleUndoStart = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!this.elements.undoMenu.classList.contains('hidden')) {
        this.elements.undoMenu.classList.add('hidden');
        if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
        undoLongPressed = true;
        return;
      }
      undoLongPressed = false;
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(showUndoMenu, 400);
    };

    const handleUndoEnd = (e) => {
      if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
        if (!undoLongPressed && (e.target === this.elements.undoBtn || this.elements.undoBtn.contains(e.target))) {
          this.handlers.onUndo();
        }
      }
    };

    this.elements.undoBtn?.addEventListener('pointerdown', handleUndoStart);
    window.addEventListener('pointerup', handleUndoEnd);
    this.elements.undoBtn?.addEventListener('contextmenu', e => e.preventDefault());

    // Close undo menu on outside pointer down
    window.addEventListener('pointerdown', (e) => {
      if (this.elements.undoMenu && !this.elements.undoMenu.classList.contains('hidden')) {
        if (!this.elements.undoMenu.contains(e.target) && !this.elements.undoBtn.contains(e.target)) {
          this.elements.undoMenu.classList.add('hidden');
          this.handlers.onOverlayClosed();
        }
      }
    });
  },

  closeDropdown() {
    this.elements.dropdown?.classList.add('hidden');
    if (this.elements.dropdownCaret) {
      this.elements.dropdownCaret.style.transform = 'rotate(0deg)';
    }
  },

  updateHeader(elapsedMs, moves) {
    if (this.elements.timeDisplay) {
      const secs = Math.floor(elapsedMs / 1000);
      const mins = Math.floor(secs / 60);
      this.elements.timeDisplay.innerText = `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
    }
    if (this.elements.movesDisplay) {
      this.elements.movesDisplay.innerText = moves;
    }
  },

  updateSeed(seed) {
    if (!this.elements.seedDisplay || !this.elements.seedValue) return;
    if (seed !== undefined) {
      this.elements.seedValue.innerText = seed;
      this.elements.seedDisplay.classList.remove('hidden');
    } else {
      this.elements.seedDisplay.classList.add('hidden');
    }
  },

  hideSeedInput() {
    this.elements.seedInput?.classList.add('hidden');
  },

  getSeedInputValue() {
    return this.elements.seedInput?.value;
  },

  clearSeedInput() {
    if (this.elements.seedInput) {
      this.elements.seedInput.value = "";
    }
  }
};
