// tween.js — Animation system
const activeTweens = [];

export function tween(obj, props, duration = 200, easing = 'easeOutQuad') {
  return new Promise(resolve => {
    const start = {};
    const end = {};
    for (const key in props) {
      start[key] = obj[key] ?? 0;
      end[key] = props[key];
    }
    activeTweens.push({
      obj, start, end, duration,
      elapsed: 0, easing, resolve,
    });
  });
}

export function updateTweens(dt) {
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    const tw = activeTweens[i];
    tw.elapsed += dt;
    const t = Math.min(tw.elapsed / tw.duration, 1);
    const e = easings[tw.easing](t);
    for (const key in tw.start) {
      tw.obj[key] = tw.start[key] + (tw.end[key] - tw.start[key]) * e;
    }
    if (t >= 1) {
      activeTweens.splice(i, 1);
      tw.resolve();
    }
  }
}

export function hasTweens() {
  return activeTweens.length > 0;
}

export function clearTweens() {
  while (activeTweens.length) {
    const tw = activeTweens.pop();
    for (const key in tw.end) tw.obj[key] = tw.end[key];
    tw.resolve();
  }
}

const easings = {
  linear: t => t,
  easeOutQuad: t => t * (2 - t),
  easeOutBack: t => { const s = 1.70158; return 1 + (t - 1) * (t - 1) * ((s + 1) * (t - 1) + s) + (t - 1) * (t - 1); },
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};
// Fix easeOutBack
easings.easeOutBack = t => {
  const s = 1.70158;
  t = t - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
