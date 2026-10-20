import { newProject } from '../domain/project.js';
import { validateProject } from '../infrastructure/validation.js';
import { ScopedHistory } from './scoped-history.js';

export class Session {
  #preview = null;

  constructor() {
    this.project = newProject();
    this.undoStack = [];
    this.redoStack = [];
    this.initial = JSON.stringify(this.project);
    this.scopedHistory = new ScopedHistory();
  }
  get dirty() {
    return this.initial !== JSON.stringify(this.project);
  }
  get viewProject() {
    return this.#preview?.draft ?? this.project;
  }
  beginPreview() {
    if (this.#preview) throw new Error('请先结束当前预览编辑');
    const token = Symbol('preview');
    this.#preview = { token, base: this.project, draft: structuredClone(this.project) };
    return token;
  }
  updatePreview(token, change) {
    const preview = this.#preview;
    if (!preview || preview.token !== token) return false;
    const draft = structuredClone(preview.base);
    change(draft);
    preview.draft = draft;
    return true;
  }
  cancelPreview(token) {
    if (!this.#preview || (token !== undefined && this.#preview.token !== token)) return false;
    this.#preview = null;
    return true;
  }
  commitPreview(token) {
    const preview = this.#preview;
    if (!preview || preview.token !== token) return false;
    this.#preview = null;
    if (this.project !== preview.base) throw new Error('会话已变化，请重新调整');
    return this.edit((draft) => Object.assign(draft, preview.draft));
  }
  edit(change) {
    if (this.#preview) throw new Error('请先确认或取消当前预览编辑');
    const draft = structuredClone(this.project);
    change(draft);
    validateProject(draft);
    if (JSON.stringify(draft) === JSON.stringify(this.project)) return false;
    this.scopedHistory.record(this.project, draft);
    this.undoStack.push(this.project);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.project = draft;
    this.redoStack = [];
    return true;
  }
  undo() {
    this.cancelPreview();
    if (this.undoStack.length) {
      this.redoStack.push(this.project);
      this.project = this.undoStack.pop();
      this.scopedHistory.cursor--;
    }
  }
  redo() {
    this.cancelPreview();
    if (this.redoStack.length) {
      this.undoStack.push(this.project);
      this.project = this.redoStack.pop();
      this.scopedHistory.cursor++;
    }
  }
  replace(project) {
    validateProject(project);
    this.cancelPreview();
    this.project = structuredClone(project);
    this.undoStack = [];
    this.redoStack = [];
    this.initial = JSON.stringify(this.project);
    this.scopedHistory = new ScopedHistory();
  }
  canReset(groupId, scope, frame) {
    return Boolean(this.scopedHistory.baseline(this.project, groupId, scope, frame));
  }
  resetScope(groupId, scope, frame) {
    const baseline = this.scopedHistory.baseline(this.project, groupId, scope, frame);
    if (!baseline) return false;
    return this.edit((project) => {
      const group = project.groups.find((item) => item.id === groupId);
      const target = scope === 'group' ? group : group.frames[frame];
      for (const [key, value] of Object.entries(baseline)) {
        if (value === undefined) delete target[key];
        else target[key] = value;
      }
    });
  }
}
