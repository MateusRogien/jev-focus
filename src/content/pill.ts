/*
 * The floating "12 hidden · Deep Work" pill. Lives in a closed shadow root so YouTube's
 * styles can't reach it and page scripts can't read it. Fades out after a few seconds of
 * no change; clicking it opens the popup.
 */

const VISIBLE_MS = 2600;

const STYLE = `
:host { all: initial; }
button {
  font: 500 12px/1 ui-sans-serif, -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; gap: 8px;
  height: 28px; padding: 0 12px;
  color: #ECEDEF; background: #16181F;
  border: 1px solid #2A2E39; border-radius: 999px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.28);
  cursor: pointer;
  opacity: 0; transform: translateY(4px);
  transition: opacity 150ms cubic-bezier(.2,.8,.2,1), transform 150ms cubic-bezier(.2,.8,.2,1);
  pointer-events: none;
}
button.on { opacity: 1; transform: none; pointer-events: auto; }
button:hover { background: #1E212A; }
button:focus-visible { outline: none; box-shadow: 0 0 0 2px #0E0F13, 0 0 0 4px #E8B86D; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #E8B86D; }
.error .dot { background: #E07A6B; }
.n { color: #E07A6B; }
.sep { color: #8A8F9C; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

export class Pill {
  private host: HTMLElement | undefined;
  private button: HTMLButtonElement | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private enabled = false;
  private profile = '';
  private count = 0;
  private degraded = false;
  private message: { text: string; tone: 'error' } | undefined;

  constructor(private readonly onClick: () => void) {}

  configure(enabled: boolean, profileName: string) {
    this.enabled = enabled;
    this.profile = profileName;
    if (!enabled) this.hide();
    else this.render(false);
  }

  setCount(n: number) {
    if (n === this.count) return;
    const grew = n > this.count;
    this.count = n;
    this.render(grew);
  }

  setDegraded(d: boolean) {
    if (d === this.degraded) return;
    this.degraded = d;
    this.render(d);
  }

  /** Persistent message (e.g. orphaned after an update). Shown even when the pill is off. */
  show(text: string, tone: 'error') {
    this.message = { text, tone };
    this.render(true, true);
  }

  private mount(): HTMLButtonElement | undefined {
    if (this.button) return this.button;
    if (!document.body) return undefined;
    this.host = document.createElement('div');
    this.host.id = 'jev-focus-pill';
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.addEventListener('click', this.onClick);
    this.button.addEventListener('mouseenter', () => clearTimeout(this.timer));
    this.button.addEventListener('mouseleave', () => this.fadeLater());
    shadow.append(style, this.button);
    document.body.append(this.host);
    return this.button;
  }

  private render(reveal: boolean, sticky = false) {
    if (!this.enabled && !this.message) return;
    if (!this.count && !this.degraded && !this.message) return;
    const b = this.mount();
    if (!b) {
      // Body not parsed yet (document_start); try again shortly.
      document.addEventListener('DOMContentLoaded', () => this.render(reveal, sticky), {
        once: true,
      });
      return;
    }
    const wasOn = b.classList.contains('on');
    b.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    if (this.message) {
      b.className = 'error';
      label.textContent = this.message.text;
      b.append(dot, label);
    } else {
      b.className = this.degraded ? 'error' : '';
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(this.count);
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '·';
      label.textContent = this.degraded ? 'Jev unavailable — videos held' : this.profile;
      b.append(dot, n, document.createTextNode(' hidden'), sep, label);
    }
    if (wasOn) b.classList.add('on');
    b.setAttribute(
      'aria-label',
      this.message
        ? this.message.text
        : `${this.count} videos hidden, profile ${this.profile}. Open Jev Focus.`,
    );
    if (reveal || sticky) {
      requestAnimationFrame(() => b.classList.add('on'));
      if (!sticky && !this.degraded) this.fadeLater();
    }
  }

  private fadeLater() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.button?.classList.remove('on'), VISIBLE_MS);
  }

  private hide() {
    clearTimeout(this.timer);
    this.button?.classList.remove('on');
  }
}
