import { describe, expect, test } from 'vitest';
import { loadModelView, saveModelView } from './view-preferences';
describe('explicit model view preference',()=>{
  test('defaults to 2D on mobile and 3D on desktop',()=>{expect(loadModelView({getItem:()=>null},true).view).toBe('2d');expect(loadModelView({getItem:()=>null},false).view).toBe('3d');});
  test('respects an explicit choice across device sizes',()=>{expect(loadModelView({getItem:()=> '3d'},true).view).toBe('3d');expect(loadModelView({getItem:()=> '2d'},false).view).toBe('2d');});
  test('invalid or denied storage uses supported device default',()=>{expect(loadModelView({getItem:()=> 'bad'},true)).toEqual({view:'2d',warning:true});expect(loadModelView({getItem:()=>{throw Error();}},false)).toEqual({view:'3d',warning:true});expect(saveModelView({setItem:()=>{throw Error();}},'2d')).toBe(false);});
});
