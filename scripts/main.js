//Fenster laden
window.addEventListener('load', () => {
  const overlay = document.getElementById('status-overlay');
  let overlayTimer;

  //Funktion für Meldungseinblendung
  function showOverlay(msg) {
    clearTimeout(overlayTimer);
    overlay.textContent = msg;
    overlay.style.display = 'block';
    overlayTimer = setTimeout(() => { overlay.style.display = 'none'; }, 2000);
  }

  // Klasse für Blöckemanagement
  class BlockManager {
    constructor(workspace) {
      this.workspace = workspace;
      this.blocks = [];
    }
    add(type) {
      const b = this.workspace.newBlock(type);
      b.initSvg(); b.render();
      if (this.blocks.length) {
        b.previousConnection.connect(this.blocks[this.blocks.length - 1].nextConnection);
      } else {
        b.moveBy(20, 20);
      }
      this.blocks.push(b);
    }
    undo() {
      if (this.blocks.length) {
        const b = this.blocks.pop();
        b.dispose();
      }
    }
    clear() {
      this.blocks = [];
    }
    forEach(fn) {
      this.blocks.forEach(fn);
    }
    getSequence() {
      return this.blocks.map(b => b.type);
    }
  }

  //Definition und Laden der Bilder
  const names = ['tree', 'rock', 'hole', 'waves', 'treasure', 'robot'];
  const imgs = names.map(n => { const i = new Image(); i.src = './img/' + n + '.svg'; return i; });
  Promise.all(imgs.map(img => new Promise((res, rej) => { img.onload = res; img.onerror = rej; })))
    .then(init)
    .catch(() => showOverlay('Fehler beim Laden der Bilder'));

  // kleine Helfer
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isMatrix = (g) => Array.isArray(g) && g.length > 0 && g.every(r => Array.isArray(r) && r.length === g[0].length);
  const computeVariante = (g) => {
    // 1=Stein, 2=Loch, 3=Baum, 4=Wasser
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[0].length; x++) {
        if (g[y][x] === 2 || g[y][x] === 3 || g[y][x] === 4) return 1;
      }
    }
    return 0;
  };

  //Initialisierung
  function init() {
    //Blockly-Blöcke
    const toolbox = document.getElementById('toolbox');
    Blockly.defineBlocksWithJsonArray([
      { type: 'move_forward', message0: 'gehe ein Feld weiter', previousStatement: null, nextStatement: null, colour: 160 },
      { type: 'turn_right', message0: 'drehe dich nach rechts', previousStatement: null, nextStatement: null, colour: 230 },
      { type: 'turn_left', message0: 'drehe dich nach links', previousStatement: null, nextStatement: null, colour: 230 },
      { type: 'jump', message0: 'springe über ein Loch', previousStatement: null, nextStatement: null, colour: 120 },
      { type: 'climb', message0: 'klettere ein Feld weiter', previousStatement: null, nextStatement: null, colour: 65 },
      { type: 'swim', message0: 'schwimme ein Feld weiter', previousStatement: null, nextStatement: null, colour: 180 }
    ]);
    const workspace = Blockly.inject('blocklyDiv', { toolbox, readOnly: true, scrollbars: true, renderer: 'zelos', theme: Blockly.Themes.Classic });
    const manager = new BlockManager(workspace);

    //Zeichenfläche
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const [imgTree, imgRock, imgHole, imgTunnel, imgTreasure, imgRobot] = imgs;

    let labyrinth, player, goal, state, cols, rows, cellSize;

    //Labyrinthe (Beispiele)
    const mazes = [{
      name: 'Labyrinth 1',
      grid: [
        [0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 1, 0]
      ],
      player: { x: 0, y: 0, dir: 2 },
      goal: { x: 4, y: 4 },
      variante: 0
    },
    {
      name: 'Labyrinth 2',
      grid: [
        [0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 1, 0]
      ],
      player: { x: 4, y: 0, dir: 2 },
      goal: { x: 0, y: 0 },
      variante: 0
    },
    {
      name: 'Labyrinth 3',
      grid: [
        [0, 0, 1, 0, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
        [1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
        [1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 0],
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        [1, 1, 1, 0, 1, 1, 1, 0, 1, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
        [1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
      player: { x: 0, y: 0, dir: 1 },
      goal: { x: 7, y: 3 },
      variante: 0
    },
    {
      name: 'Labyrinth 4',
      grid: [
        [1, 0, 4, 4, 0, 0],
        [1, 0, 1, 1, 1, 1],
        [1, 0, 0, 2, 0, 1],
        [1, 1, 1, 1, 3, 1],
        [1, 1, 1, 1, 3, 1],
        [0, 0, 0, 0, 0, 1]
      ],
      player: { x: 0, y: 5, dir: 1 },
      goal: { x: 5, y: 0 },
      variante: 1
    },
    {
      name: 'Labyrinth 5',
      grid: [
        [0, 0, 2, 0, 0, 1, 3, 3],
        [1, 2, 0, 2, 0, 0, 3, 3],
        [0, 0, 1, 0, 0, 2, 3, 3],
        [0, 3, 1, 3, 3, 0, 1, 0],
        [3, 3, 1, 3, 3, 0, 2, 0],
        [0, 1, 1, 0, 1, 1, 1, 0],
        [4, 4, 4, 4, 4, 4, 1, 1],
        [4, 3, 3, 1, 4, 1, 4, 4]
      ],
      player: { x: 7, y: 4, dir: 2 },
      goal: { x: 0, y: 3 },
      variante: 1
    },
    {
      name: 'Labyrinth 6',
      grid: [
        [0, 0, 2, 0, 0, 0, 3, 3, 3],
        [2, 1, 1, 1, 0, 2, 3, 3, 3],
        [0, 0, 1, 1, 0, 0, 3, 3, 3],
        [3, 3, 3, 1, 3, 3, 0, 0, 3],
        [3, 3, 3, 3, 3, 3, 2, 0, 0],
        [1, 1, 1, 0, 1, 1, 1, 0, 2],
        [4, 4, 4, 4, 4, 4, 1, 1, 0],
        [4, 3, 3, 1, 4, 0, 0, 4, 4],
        [4, 4, 4, 4, 4, 1, 0, 1, 4]
      ],
      player: { x: 0, y: 0, dir: 2 },
      goal: { x: 6, y: 8 },
      variante: 1
    },
    {
      name: 'Ü1',
      grid: [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 0, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
      ],
      player: { x: 3, y: 4, dir: 3 },
      goal: { x: 4, y: 2 },
      variante: 0
    },
    {
      name: 'Ü2',
      grid: [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 1, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 1, 0, 0, 1],
        [1, 0, 0, 1, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
      ],
      player: { x: 1, y: 4, dir: 4 },
      goal: { x: 4, y: 4 },
      variante: 0
    },
    {
      name: 'Ü3',
      grid: [
        [4, 4, 1, 1, 4],
        [1, 2, 4, 4, 4],
        [0, 1, 2, 0, 1],
        [0, 3, 1, 0, 4],
        [0, 0, 2, 0, 4]
      ],
      player: { x: 2, y: 2, dir: 1 },
      goal: { x: 3, y: 2 },
      variante: 1
    },
    {
      name: 'Ü4',
      grid: [
        [1, 1, 1, 4, 0],
        [1, 3, 3, 4, 4],
        [3, 3, 1, 4, 4],
        [3, 0, 2, 0, 4],
        [0, 3, 1, 1, 1]
      ],
      player: { x: 4, y: 0, dir: 2 },
      goal: { x: 0, y: 4 },
      variante: 1
    }
    ];

    const select = document.getElementById('selectMaze');
    mazes.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = m.name; select.append(o); });
    select.onchange = () => loadMaze(parseInt(select.value, 10));

    //Labyrinth bestimmen und Blöcke ein-/ausblenden
    function loadMaze(idx) {
      // Reset everything
      manager.clear();
      workspace.clear();
      overlay.style.display = 'none';

      const m = mazes[idx];
      labyrinth = m.grid;
      player = { ...m.player };
      goal = { ...m.goal };
      state = { ...player };
      // Show/hide advanced command buttons based on variante
      const showAdvanced = m.variante === 1;
      document.getElementById('btnJump').style.display = showAdvanced ? 'block' : 'none';
      document.getElementById('btnClimb').style.display = showAdvanced ? 'block' : 'none';
      document.getElementById('btnSwim').style.display = showAdvanced ? 'block' : 'none';
      rows = labyrinth.length;
      cols = labyrinth[0].length;
      cellSize = 500 / Math.max(cols, rows);

      canvas.width = cols * cellSize;
      canvas.height = rows * cellSize;

      draw();
    }

    //Zeichnen des Labyrinths
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        ctx.strokeStyle = '#ccc'; ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
        const px = x * cellSize, py = y * cellSize;
        switch (labyrinth[y][x]) {
          case 1: ctx.drawImage(imgRock, px, py, cellSize, cellSize); break;
          case 2: ctx.drawImage(imgHole, px, py, cellSize, cellSize); break;
          case 3: ctx.drawImage(imgTree, px, py, cellSize, cellSize); break;
          case 4: ctx.drawImage(imgTunnel, px, py, cellSize, cellSize); break; // waves.svg
        }
      }
      ctx.drawImage(imgTreasure, goal.x * cellSize, goal.y * cellSize, cellSize, cellSize);
      ctx.save(); ctx.translate(state.x * cellSize + cellSize / 2, state.y * cellSize + cellSize / 2);
      ctx.rotate(state.dir * Math.PI / 2 + Math.PI);
      ctx.drawImage(imgRobot, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
      ctx.restore();
    }

    //angeklickte Anweisung ausführen (Programmlogik)
    function apply(cmd) {
      let { x, y, dir } = state;
      const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0;
      const dy = dir === 2 ? 1 : dir === 0 ? -1 : 0;
      let nx = x, ny = y, ndir = dir;
      if (cmd === 'move_forward') {
        if ([3, 4].includes(labyrinth[y][x])) { showOverlay('Anweisung nicht ausführbar!'); return false; }
        nx += dx; ny += dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || [1, 2, 3, 4].includes(labyrinth[ny][nx])) { showOverlay('Anweisung nicht ausführbar!'); return false; }
      } else if (cmd === 'jump') {
        const mx = x + dx, my = y + dy; nx = x + dx * 2; ny = y + dy * 2;
        if (mx < 0 || mx >= cols || my < 0 || my >= rows || labyrinth[my][mx] !== 2 || nx < 0 || nx >= cols || ny < 0 || ny >= rows || labyrinth[ny][nx] !== 0) { showOverlay('Anweisung nicht ausführbar!'); return false; }
      } else if (cmd === 'climb') {
        nx += dx; ny += dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !(labyrinth[ny][nx] === 3 || (labyrinth[y][x] === 3 && labyrinth[ny][nx] === 0))) { showOverlay('Anweisung nicht ausführbar!'); return false; }
      } else if (cmd === 'swim') {
        nx += dx; ny += dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !(labyrinth[ny][nx] === 4 || (labyrinth[y][x] === 4 && labyrinth[ny][nx] === 0))) { showOverlay('Anweisung nicht ausführbar!'); return false; }
      } else if (cmd === 'turn_right') ndir = (dir + 1) % 4;
      else if (cmd === 'turn_left') ndir = (dir + 3) % 4;
      state = { x: nx, y: ny, dir: ndir };
      if (state.x === goal.x && state.y === goal.y) showOverlay('Ziel erreicht!');
      draw(); return true;
    }

    //Blöcke nach Klick in Blockly-Bereich hinzufügen
    function add(cmd) { if (!apply(cmd)) return; manager.add(cmd); }
    document.getElementById('btnAddForward').onclick = () => add('move_forward');
    document.getElementById('btnAddRight').onclick = () => add('turn_right');
    document.getElementById('btnAddLeft').onclick = () => add('turn_left');
    document.getElementById('btnJump').onclick = () => add('jump');
    document.getElementById('btnClimb').onclick = () => add('climb');
    document.getElementById('btnSwim').onclick = () => add('swim');
    document.getElementById('btnUndo').onclick = () => { manager.undo(); state = { ...player }; manager.forEach(b => apply(b.type)); draw(); };

    // Programm speichern
    document.getElementById('btnSave').onclick = async () => {
      const seq = manager.getSequence();
      const jsonText = JSON.stringify(seq, null, 2);

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'Labyrinth.json',
            types: [{ description: 'JSON-Datei', accept: { 'application/json': ['.json'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(jsonText);
          await writable.close();
          return;
        } catch (err) {
          if (err.name !== 'AbortError') alert('❌ Fehler beim Speichern:\n' + err.message);
          return;
        }
      }

      let filename = prompt('Dateiname für das Programm:', 'Labyrinth');
      if (!filename) return;
      if (!filename.toLowerCase().endsWith('.json')) filename += '.json';

      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Programm laden (Sequenz)
    const fileInputSeq = document.getElementById('fileInputSequence');
    document.getElementById('btnLoadSequence').onclick = () => { fileInputSeq.value = ''; fileInputSeq.click(); };
    fileInputSeq.onchange = e => {
      if (!e.target.files[0]) { showOverlay('Keine Datei ausgewählt!'); return; }
      //loadMaze(parseInt(select.value, 10));
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const seq = JSON.parse(evt.target.result);
          if (!Array.isArray(seq) || !seq.every(c => ['move_forward', 'turn_right', 'turn_left', 'jump', 'climb', 'swim'].includes(c))) {
            showOverlay('Ungültige Anweisungsfolge!'); return;
          }
          manager.clear(); state = { ...player };
          for (let i = 0; i < seq.length; i++) {
            const cmd = seq[i];
            if (!apply(cmd)) break;
            manager.add(cmd);
          }
        } catch { showOverlay('Fehler beim Laden!'); }
      };
      reader.readAsText(e.target.files[0]);
    };

    // >>> NEU: Labyrinth-Import <<<
    const btnImportMaze = document.getElementById('btnImportMaze');
    const fileInputMaze = document.getElementById('fileInputMaze');

    btnImportMaze.onclick = () => { fileInputMaze.value = ''; fileInputMaze.click(); };

    fileInputMaze.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) { showOverlay('Keine Datei ausgewählt!'); return; }

      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const data = JSON.parse(evt.target.result);

          // Minimaler Schema-Check
          if (!data || !isMatrix(data.grid)) throw new Error('grid fehlt oder hat falsches Format');
          const g = data.grid;
          const r = g.length, c = g[0].length;

          // Gültige Zellenwerte 0..4 sicherstellen
          for (let y = 0; y < r; y++) {
            if (g[y].length !== c) throw new Error('Unregelmäßige Zeilenlängen');
            for (let x = 0; x < c; x++) {
              const v = g[y][x];
              if (typeof v !== 'number' || v < 0 || v > 4) throw new Error('Ungültiger Zellenwert');
            }
          }

          // player/goal prüfen oder defaults
          const s = data.player || { x: 0, y: 0, dir: 2 };
          const t = data.goal || { x: c - 1, y: r - 1 };
          s.x = clamp(~~s.x, 0, c - 1); s.y = clamp(~~s.y, 0, r - 1); s.dir = clamp(~~s.dir, 0, 3);
          t.x = clamp(~~t.x, 0, c - 1); t.y = clamp(~~t.y, 0, r - 1);

          // variante ggf. berechnen
          const vcalc = typeof data.variante === 'number' ? (data.variante ? 1 : 0) : computeVariante(g);

          // Zustand setzen
          labyrinth = g;
          player = { x: s.x, y: s.y, dir: s.dir };
          goal = { x: t.x, y: t.y };
          state = { ...player };

          rows = r; cols = c;
          cellSize = 500 / Math.max(cols, rows);
          canvas.width = cols * cellSize;
          canvas.height = rows * cellSize;

          // Zusatz-Anweisungen sichtbar je nach variante
          const adv = vcalc === 1;
          document.getElementById('btnJump').style.display = adv ? 'block' : 'none';
          document.getElementById('btnClimb').style.display = adv ? 'block' : 'none';
          document.getElementById('btnSwim').style.display = adv ? 'block' : 'none';

          // Optional: „Benutzerimport“ in Select setzen/anzeigen
          let customOpt = Array.from(select.options).find(o => o.value === 'custom');
          if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.value = 'custom';
            customOpt.textContent = 'importiertes Labyrinth';
            select.append(customOpt);
          }
          select.value = 'custom';

          manager.clear();
          workspace.clear();
          draw();
          showOverlay('Labyrinth importiert');
        } catch (err) {
          console.error(err);
          showOverlay('Ungültige Labyrinth-Datei!');
        }
      };
      reader.readAsText(file);
    };

    //player mit Labyrinth(0)
    loadMaze(0);
  }
});
