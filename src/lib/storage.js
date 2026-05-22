import { supabase } from './supabase';

const ALLOWED_ATTACHMENT_EXT = new Set([
  'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp',
  'png','jpg','jpeg','gif','webp','svg',
  'txt','csv','md','json','log',
  'zip','rar','7z',
  'mp3','mp4','mov','wav','webm'
]);

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function removeAvatar(url) {
  if (!url) return;
  const idx = url.indexOf('/avatars/');
  if (idx < 0) return;
  const path = url.slice(idx + '/avatars/'.length);
  await supabase.storage.from('avatars').remove([path]);
}

export async function uploadAttachment(userId, taskId, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
    throw new Error(`Tipo de archivo .${ext} no permitido`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${taskId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('attachments').getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, size: file.size, type: file.type, ext };
}

// Sube un archivo de contrato al bucket `attachments` bajo la ruta
// `{userId}/contracts/{slot}/{ts}-{safeName}`. `slot` puede ser el id del
// proyecto si ya existe, o un uuid temporal generado en cliente cuando se
// crea desde el form de "Nuevo proyecto" (el id real se genera en el insert).
// El path siempre empieza con `{userId}/...`, así cumple la RLS de storage
// (policy attachments_owner_first_folder en mig-7).
export async function uploadContract(userId, slot, file) {
  if (!file) throw new Error('Archivo requerido');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
    throw new Error(`Tipo de archivo .${ext} no permitido`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/contracts/${slot || 'tmp'}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('attachments').getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, size: file.size, type: file.type, ext };
}

export async function removeAttachmentFile(url) {
  if (!url) return;
  const idx = url.indexOf('/attachments/');
  if (idx < 0) return;
  const path = url.slice(idx + '/attachments/'.length);
  await supabase.storage.from('attachments').remove([path]);
}

const ALLOWED_PLATFORM_IMAGE_EXT = new Set(['png','jpg','jpeg','webp','gif','svg']);

export async function uploadPlatformImage(platformId, file) {
  if (!file) throw new Error('Archivo requerido');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_PLATFORM_IMAGE_EXT.has(ext)) {
    throw new Error(`Tipo de imagen .${ext} no permitido`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${platformId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('platforms').upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('platforms').getPublicUrl(path);
  return data.publicUrl;
}

export async function removePlatformImage(url) {
  if (!url) return;
  const idx = url.indexOf('/platforms/');
  if (idx < 0) return;
  const path = url.slice(idx + '/platforms/'.length);
  await supabase.storage.from('platforms').remove([path]);
}
