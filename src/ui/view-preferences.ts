export type ModelView = '2d' | '3d';
export const VIEW_STORAGE_KEY = 'iter-model-view-v1';
export function loadModelView(storage:Pick<Storage,'getItem'>,mobile:boolean):{view:ModelView;warning:boolean}{
  try {const saved=storage.getItem(VIEW_STORAGE_KEY); if(saved==='2d'||saved==='3d')return {view:saved,warning:false};if(saved===null)return {view:mobile?'2d':'3d',warning:false};}catch{/* Preserve navigation without browser persistence. */}
  return {view:mobile?'2d':'3d',warning:true};
}
export function saveModelView(storage:Pick<Storage,'setItem'>,view:ModelView):boolean {try{storage.setItem(VIEW_STORAGE_KEY,view);return true;}catch{return false;}}
