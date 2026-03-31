import { presets } from '../model/presets';

export interface ControlValues {
  presetIndex: number;
  mass: number;
  angleRad: number;
  rpm: number;
  showForces: boolean;
  showLabels: boolean;
  forceScale: number;
}

export type OnChangeCallback = (values: ControlValues) => void;
export type OnActionCallback = (action: 'play' | 'pause' | 'reset' | 'export') => void;

export class ControlsPanel {
  private container: HTMLElement;
  private onChange: OnChangeCallback;
  private onAction: OnActionCallback;
  private angleSlider!: HTMLInputElement;
  private angleValue!: HTMLSpanElement;
  private playBtn!: HTMLButtonElement;
  private isPlaying: boolean = false;

  values: ControlValues = {
    presetIndex: 3, // "4-Bar with Hanging Load" - Evan's mechanism
    mass: 5,
    angleRad: 0,
    rpm: 15,
    showForces: true,
    showLabels: true,
    forceScale: 0.05,
  };

  constructor(
    container: HTMLElement,
    onChange: OnChangeCallback,
    onAction: OnActionCallback
  ) {
    this.container = container;
    this.onChange = onChange;
    this.onAction = onAction;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <h1>Kinetics Simulator</h1>
        <p class="subtitle">2D Linkage Kinematics & Force Analysis</p>
      </div>
    `;

    // Preset selector
    this.addSection('Mechanism', (section) => {
      const select = this.addSelect(
        section,
        'Preset',
        presets.map((p) => p.name),
        this.values.presetIndex
      );
      select.addEventListener('change', () => {
        this.values.presetIndex = parseInt(select.value);
        this.fireChange();
      });

      const desc = document.createElement('p');
      desc.className = 'preset-desc';
      desc.textContent = presets[this.values.presetIndex].description;
      section.appendChild(desc);

      select.addEventListener('change', () => {
        desc.textContent = presets[parseInt(select.value)].description;
      });
    });

    // Load
    this.addSection('External Load', (section) => {
      const massInput = this.addNumberInput(section, 'Mass (kg)', this.values.mass, 0, 1000, 0.5);
      massInput.addEventListener('input', () => {
        this.values.mass = parseFloat(massInput.value) || 0;
        this.fireChange();
      });
    });

    // Crank angle
    this.addSection('Crank Control', (section) => {
      const angleRow = document.createElement('div');
      angleRow.className = 'input-row';
      angleRow.innerHTML = `
        <label>Angle</label>
        <div class="slider-row">
          <input type="range" min="0" max="360" step="0.5" value="0" class="angle-slider">
          <span class="angle-value">0.0°</span>
        </div>
      `;
      section.appendChild(angleRow);
      this.angleSlider = angleRow.querySelector('.angle-slider')!;
      this.angleValue = angleRow.querySelector('.angle-value')!;

      this.angleSlider.addEventListener('input', () => {
        const deg = parseFloat(this.angleSlider.value);
        this.values.angleRad = (deg * Math.PI) / 180;
        this.angleValue.textContent = `${deg.toFixed(1)}°`;
        this.fireChange();
      });

      const rpmInput = this.addNumberInput(section, 'Speed (RPM)', this.values.rpm, 1, 120, 1);
      rpmInput.addEventListener('input', () => {
        this.values.rpm = parseFloat(rpmInput.value) || 15;
      });

      const btnRow = document.createElement('div');
      btnRow.className = 'btn-row';
      this.playBtn = document.createElement('button');
      this.playBtn.className = 'btn btn-primary';
      this.playBtn.textContent = '▶ Play';
      this.playBtn.addEventListener('click', () => {
        this.isPlaying = !this.isPlaying;
        this.playBtn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
        this.playBtn.classList.toggle('active', this.isPlaying);
        this.onAction(this.isPlaying ? 'play' : 'pause');
      });

      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn';
      resetBtn.textContent = '↺ Reset';
      resetBtn.addEventListener('click', () => {
        this.values.angleRad = 0;
        this.angleSlider.value = '0';
        this.angleValue.textContent = '0.0°';
        this.onAction('reset');
      });

      btnRow.appendChild(this.playBtn);
      btnRow.appendChild(resetBtn);
      section.appendChild(btnRow);
    });

    // Display options
    this.addSection('Display', (section) => {
      const forcesCheck = this.addCheckbox(section, 'Show Forces', this.values.showForces);
      forcesCheck.addEventListener('change', () => {
        this.values.showForces = forcesCheck.checked;
        this.fireChange();
      });

      const labelsCheck = this.addCheckbox(section, 'Show Labels', this.values.showLabels);
      labelsCheck.addEventListener('change', () => {
        this.values.showLabels = labelsCheck.checked;
        this.fireChange();
      });

      const scaleInput = this.addNumberInput(section, 'Force Scale', this.values.forceScale, 0.001, 1, 0.001);
      scaleInput.addEventListener('input', () => {
        this.values.forceScale = parseFloat(scaleInput.value) || 0.01;
        this.fireChange();
      });
    });

    // Export
    this.addSection('Data Export', (section) => {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn-export';
      exportBtn.textContent = '📊 Export CSV (Full Sweep)';
      exportBtn.addEventListener('click', () => this.onAction('export'));
      section.appendChild(exportBtn);
    });

    // Help
    this.addSection('Controls', (section) => {
      section.innerHTML += `
        <ul class="help-list">
          <li><b>Scroll</b> — Zoom in/out</li>
          <li><b>Shift+Drag</b> — Pan view</li>
          <li><b>Drag slider</b> — Rotate crank</li>
        </ul>
      `;
    });
  }

  updateAngleDisplay(rad: number): void {
    const deg = ((rad * 180) / Math.PI) % 360;
    this.angleSlider.value = ((deg + 360) % 360).toString();
    this.angleValue.textContent = `${((deg + 360) % 360).toFixed(1)}°`;
  }

  private fireChange(): void {
    this.onChange(this.values);
  }

  private addSection(title: string, builder: (el: HTMLElement) => void): void {
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.innerHTML = `<h3>${title}</h3>`;
    builder(section);
    this.container.appendChild(section);
  }

  private addSelect(
    parent: HTMLElement,
    label: string,
    options: string[],
    selected: number
  ): HTMLSelectElement {
    const row = document.createElement('div');
    row.className = 'input-row';
    row.innerHTML = `<label>${label}</label>`;
    const select = document.createElement('select');
    options.forEach((opt, i) => {
      const o = document.createElement('option');
      o.value = i.toString();
      o.textContent = opt;
      if (i === selected) o.selected = true;
      select.appendChild(o);
    });
    row.appendChild(select);
    parent.appendChild(row);
    return select;
  }

  private addNumberInput(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number
  ): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'input-row';
    row.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  private addCheckbox(
    parent: HTMLElement,
    label: string,
    checked: boolean
  ): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'input-row checkbox-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.id = label.replace(/\s/g, '_');
    const lbl = document.createElement('label');
    lbl.htmlFor = input.id;
    lbl.textContent = label;
    row.appendChild(input);
    row.appendChild(lbl);
    parent.appendChild(row);
    return input;
  }
}
