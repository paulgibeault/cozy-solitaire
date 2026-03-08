import { createGameState } from './js/game.js';
import { recalcLayout } from './js/renderer.js';

// We need to polyfill window and document
global.window = { __gameState: null, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
global.document = {
  createElement: () => ({ getContext: () => ({ setTransform:()=>{}, fillRect:()=>{}, strokeRect:()=>{}, fillText:()=>{}, measureText:()=>({width:10}), beginPath:()=>{}, fill:()=>{}, stroke:()=>{}, moveTo:()=>{}, lineTo:()=>{}, quadraticCurveTo:()=>{}, closePath:()=>{}, save:()=>{}, restore:()=>{}, drawImage:()=>{} }) }),
  getElementById: () => ({ getContext: () => ({ setTransform:()=>{}, fillRect:()=>{}, strokeRect:()=>{}, fillText:()=>{}, measureText:()=>({width:10}), beginPath:()=>{}, fill:()=>{}, stroke:()=>{}, moveTo:()=>{}, lineTo:()=>{}, quadraticCurveTo:()=>{}, closePath:()=>{}, save:()=>{}, restore:()=>{}, drawImage:()=>{} }), style: {} })
};

import { initRenderer } from './js/renderer.js';
initRenderer(document.getElementById('canvas'));

console.log('Renderer initialized');
const state = createGameState('freecell', {});
global.window.__gameState = state;
console.log('State created');
try {
  recalcLayout();
  console.log('Recalc layout succeeded');
  console.log('Zones count:', state.zones.size);
} catch (e) {
  console.error(e);
}
