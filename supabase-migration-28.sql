-- ===========================================================
-- migration-28: tipos de tarea para clientes.
--
-- Hasta ahora client_tasks soporta solo entrega por archivo (sube
-- un archivo al bucket "documents"). Esto choca con el límite de
-- almacenamiento gratuito de Supabase. Solución: tipo "text", el
-- cliente responde con un enlace (Drive, Notion, etc.) o un texto
-- libre. No usa storage.
--
--   - client_tasks.task_type text not null default 'file'
--       CHECK in ('file','text'). El día que admins definan más
--       tipos se relaja este check (o se quita).
--   - client_tasks.response_text text — cuerpo de la entrega
--       cuando task_type = 'text'. Para 'file' queda null.
--
-- Idempotente.
-- ===========================================================

alter table pro_gestion.client_tasks
  add column if not exists task_type text not null default 'file';

alter table pro_gestion.client_tasks
  drop constraint if exists client_tasks_task_type_check;

alter table pro_gestion.client_tasks
  add constraint client_tasks_task_type_check
  check (task_type in ('file','text'));

alter table pro_gestion.client_tasks
  add column if not exists response_text text;

notify pgrst, 'reload config';
