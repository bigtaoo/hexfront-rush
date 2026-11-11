// A stand-in for the handful of DOM things the panels touch (dom.ts `$`), for the node test
// environment: there is no jsdom here. Only what the code under test reads and writes -- classes,
// `disabled`, text, and one child looked up by tag.

export class Classes {
  readonly on = new Set<string>();
  toggle(c: string, force?: boolean): boolean {
    const want = force === undefined ? !this.on.has(c) : force;
    if (want) this.on.add(c);
    else this.on.delete(c);
    return want;
  }
  contains(c: string): boolean {
    return this.on.has(c);
  }
  add(c: string): void {
    this.on.add(c);
  }
  remove(c: string): void {
    this.on.delete(c);
  }
}

export class FakeEl {
  readonly classList = new Classes();
  disabled = false;
  textContent = '';
  private readonly kids = new Map<string, FakeEl>();

  constructor(readonly id = '') {}

  querySelector(tag: string): FakeEl {
    let k = this.kids.get(tag);
    if (!k) {
      k = new FakeEl();
      this.kids.set(tag, k);
    }
    return k;
  }

  /** What the code wrote into the child it looked up by tag. */
  text(tag: string): string {
    return this.querySelector(tag).textContent;
  }
  get hidden(): boolean {
    return this.classList.contains('hidden');
  }
}

/** Put a document holding these elements where `$` looks for them. Call from beforeEach. */
export function installDom(...ids: string[]): Map<string, FakeEl> {
  const by = new Map(ids.map((id) => [id, new FakeEl(id)]));
  (globalThis as unknown as { document: unknown }).document = {
    getElementById: (id: string) => by.get(id) ?? null,
  };
  return by;
}
