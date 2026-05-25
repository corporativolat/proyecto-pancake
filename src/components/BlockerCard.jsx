import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import { isBlocked } from '../lib/utils';
import { EditableTextarea } from './EditableField.jsx';

// Card de bloqueo activo del proyecto (mig-34: blocker_note + blocker_since).
// Cuando el textarea se llena por primera vez el trigger SQL sella blocker_since
// y emite notif + activity. Al limpiarlo, se libera. Aquí solo se edita el texto.
export default function BlockerCard({ project, editable = false, onChange }) {
  const blocked = isBlocked(project);
  const since = project?.blocker_since ? new Date(project.blocker_since) : null;
  const sinceLabel = since && !isNaN(since)
    ? since.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  if (!blocked && !editable) return null;

  return (
    <div className={`rounded-2xl border p-3 ${blocked ? 'bg-red-50 border-red-200' : 'bg-ink-50 border-ink-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {blocked ? (
            <AlertOctagon className="w-4 h-4 text-red-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-ink-400" />
          )}
          <span className={`text-[10px] font-black uppercase tracking-widest ${blocked ? 'text-red-700' : 'text-ink-500'}`}>
            {blocked ? 'Bloqueo activo' : 'Bloqueos / impedimentos'}
          </span>
        </div>
        {blocked && sinceLabel && (
          <span className="text-[10px] text-red-700 font-bold bg-white/60 px-2 py-0.5 rounded-full" title="Desde">
            desde {sinceLabel}
          </span>
        )}
      </div>
      {editable ? (
        <EditableTextarea
          value={project?.blocker_note || ''}
          onSave={v => onChange?.(v)}
          placeholder="Describe el bloqueo (qué falta, quién, próximo paso). Al rellenar este campo se notifica al equipo."
          rows={3}
          className={`w-full rounded-xl px-3 py-2 text-[12px] font-medium leading-snug resize-none outline-none focus:ring-2 ${blocked ? 'bg-white border border-red-200 text-red-900 focus:ring-red-300' : 'bg-white border border-ink-200 text-ink-700 focus:ring-violet-300'}`}
        />
      ) : (
        blocked && (
          <p className="text-[12px] text-red-900 leading-snug whitespace-pre-wrap">
            {project.blocker_note}
          </p>
        )
      )}
      {editable && blocked && (
        <p className="mt-1.5 text-[10px] text-red-600 italic">
          Vacía este campo cuando se resuelva el bloqueo.
        </p>
      )}
    </div>
  );
}
