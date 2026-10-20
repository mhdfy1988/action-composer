import { drawFrame } from '../rendering/frame.js';
import { placement } from '../domain/project.js';
import { CORNERS } from '../domain/transform.js';

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.zoom = 1;
    this.geometry = null;
    this.pan = { x: 0, y: 0 };
    this.selected = false;
    this.framing = null;
  }
  resetView() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.framing = null;
  }
  render(
    project,
    group,
    frame,
    media,
    { samples, editable = true, scope = 'group', firstOverlay = false },
  ) {
    this.scope = scope;
    if (this.groupId !== group?.id) {
      this.selected = false;
    }
    this.groupId = group?.id;
    const visibilityKey = samples
      .map((item) => item.group.id)
      .sort()
      .join(',');
    if (visibilityKey !== this.visibilityKey) this.resetView();
    this.visibilityKey = visibilityKey;
    const activeVisible = samples.some((item) => item.group.id === group?.id);
    const canvas = this.canvas,
      box = canvas.getBoundingClientRect(),
      dpr = devicePixelRatio || 1;
    const w = Math.max(1, Math.round(box.width * dpr)),
      h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, box.width, box.height);
    const panel = box.width;
    if (!this.framing) {
      const rects = samples.flatMap(({ group: item }) =>
        item.frames.map((_, index) => placement(project, item, index)),
      );
      const origin = project.stage;
      const left = Math.min(origin.originX, ...rects.map((p) => p.x)) - 32;
      const top = Math.min(origin.originY, ...rects.map((p) => p.y)) - 32;
      const right = Math.max(origin.originX, ...rects.map((p) => p.x + p.width)) + 32;
      const bottom = Math.max(origin.originY, ...rects.map((p) => p.y + p.height)) + 32;
      this.framing = rects.length
        ? { left, top, width: right - left, height: bottom - top }
        : { left: origin.originX - 256, top: origin.originY - 256, width: 512, height: 512 };
    }
    const fit = this.framing;
    const unit = Math.max(
      0.01,
      Math.min((panel - 56) / fit.width, (box.height - 56) / fit.height) * this.zoom,
    );
    const top = (box.height - fit.height * unit) / 2 - fit.top * unit + this.pan.y;
    const left = (panel - fit.width * unit) / 2 - fit.left * unit + this.pan.x;
    const frameLeft = left;
    this.geometry = { unit, left, top, panel, box };
    const content = (offset) => {
      ctx.save();
      ctx.translate(offset, top);
      ctx.scale(unit, unit);
      if (firstOverlay && group && frame !== 0 && activeVisible) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        drawFrame(ctx, project, group, 0, media);
        ctx.restore();
      }
      for (const sample of samples) {
        // 非编辑动作仅作为淡化参照；透明度属于观察效果，不写回素材或导出。
        ctx.save();
        ctx.globalAlpha = sample.group.id === group?.id ? 1 : 0.4;
        drawFrame(ctx, project, sample.group, sample.frame, media);
        ctx.restore();
      }
      ctx.strokeStyle = '#5397bc';
      ctx.lineWidth = 1 / unit;
      ctx.setLineDash([5 / unit, 5 / unit]);
      ctx.beginPath();
      ctx.moveTo(project.stage.originX, -top / unit);
      ctx.lineTo(project.stage.originX, (box.height - top) / unit);
      ctx.moveTo(-offset / unit, project.stage.originY);
      ctx.lineTo((box.width - offset) / unit, project.stage.originY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#306ca9';
      ctx.beginPath();
      ctx.arc(project.stage.originX, project.stage.originY, 4 / unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${11 / unit}px "Microsoft YaHei UI", sans-serif`;
      ctx.fillText('原点', project.stage.originX + 8 / unit, project.stage.originY - 8 / unit);
      const point = group?.anchors[frame];
      if (activeVisible && point) {
        const p = placement(project, group, frame),
          x = p.x + point.x * group.scale,
          y = p.y + point.y * group.scale;
        ctx.strokeStyle = '#ad6928';
        ctx.lineWidth = 2 / unit;
        ctx.beginPath();
        ctx.arc(x, y, 6 / unit, 0, Math.PI * 2);
        ctx.moveTo(x - 12 / unit, y);
        ctx.lineTo(x + 12 / unit, y);
        ctx.moveTo(x, y - 12 / unit);
        ctx.lineTo(x, y + 12 / unit);
        ctx.stroke();
      }
      ctx.restore();
    };
    content(left);
    this.transformBox = null;
    this.imageBox = null;
    if (group && activeVisible) {
      const p = placement(project, group, frame);
      this.imageBox = {
        x: frameLeft + p.x * unit,
        y: top + p.y * unit,
        width: p.width * unit,
        height: p.height * unit,
      };
    }
    if (this.imageBox && this.selected && editable) {
      this.transformBox = this.imageBox;
      const b = this.transformBox;
      ctx.save();
      // 操作框属于观察覆盖层，不受舞台导出裁切影响，也不进入导出绘制。
      ctx.beginPath();
      ctx.rect(0, 0, panel, box.height);
      ctx.clip();
      ctx.strokeStyle = '#306ca9';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      for (const [x, y] of scope === 'group' ? Object.values(CORNERS) : []) {
        const px = b.x + x * b.width,
          py = b.y + y * b.height;
        ctx.fillRect(px - 4, py - 4, 8, 8);
        ctx.strokeRect(px - 4, py - 4, 8, 8);
      }
      ctx.restore();
    }
    return unit;
  }
  hitTransform(clientX, clientY) {
    const b = this.transformBox,
      g = this.geometry;
    if (!b || !g) return null;
    const x = clientX - g.box.left,
      y = clientY - g.box.top;
    for (const [corner, [cx, cy]] of this.scope === 'group' ? Object.entries(CORNERS) : [])
      if (Math.abs(x - b.x - cx * b.width) <= 10 && Math.abs(y - b.y - cy * b.height) <= 10)
        return corner;
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height ? 'move' : null;
  }
  hitImage(clientX, clientY) {
    const b = this.imageBox,
      g = this.geometry;
    if (!b || !g) return false;
    const x = clientX - g.box.left,
      y = clientY - g.box.top;
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }
  toStage(clientX, clientY) {
    const g = this.geometry;
    if (!g) return null;
    return {
      x: (clientX - g.box.left - g.left) / g.unit,
      y: (clientY - g.box.top - g.top) / g.unit,
    };
  }
}
