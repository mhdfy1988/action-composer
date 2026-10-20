import { frameKey } from '../domain/frame-operations.js';
const GROUP_FIELDS = ['scale', 'x', 'y'];
const FRAME_FIELDS = ['horizontalOffset', 'verticalOffset'];
const fields = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 仅记录变换参数，不持有图片或整组旧快照；游标随撤销／恢复移动。
export class ScopedHistory {
  constructor() {
    this.entries = [];
    this.cursor = 0;
  }
  record(before, after) {
    const changes = [];
    for (const group of after.groups) {
      const previous = before.groups.find((item) => item.id === group.id);
      if (!previous) continue; // 导入属于素材操作，不是整组调整。
      const add = (scope, frame, a, b, keys) => {
        const from = fields(a, keys),
          to = fields(b, keys);
        if (!same(from, to)) changes.push({ groupId: group.id, scope, frame, from, to });
      };
      add('group', null, previous, group, GROUP_FIELDS);
      group.frames.forEach((item, index) => {
        const key = frameKey(item, index);
        const old = previous.frames.find((f, i) => frameKey(f, i) === key);
        if (old) add('frame', key, old, item, FRAME_FIELDS);
      });
    }
    this.entries.length = this.cursor;
    this.entries.push(changes);
    this.cursor++;
  }
  baseline(project, groupId, scope, frame) {
    const group = project.groups.find((item) => item.id === groupId);
    const current = scope === 'group' ? group : group?.frames[frame];
    if (!current) return null;
    for (let index = 0; index < this.cursor; index++) {
      const change = this.entries[index].find(
        (item) =>
          item.groupId === groupId &&
          item.scope === scope &&
          (scope === 'group' || item.frame === frameKey(current, frame)),
      );
      if (change)
        return same(fields(current, scope === 'group' ? GROUP_FIELDS : FRAME_FIELDS), change.from)
          ? null
          : change.from;
    }
    return null;
  }
}
