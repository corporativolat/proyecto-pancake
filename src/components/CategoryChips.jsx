import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { projectAllCategoryIds } from '../lib/utils';

// Render multi-categoría (primaria + extras) en formato chips.
// - readOnly: solo muestra las chips
// - editable: muestra picker para añadir/quitar extras; el chip primario es
//             distintivo (más oscuro) y no se elimina aquí (cámbialo desde
//             el select de tipo principal).
//
// onChange recibe ({ category_id, extra_category_ids }) ya normalizado.
export default function CategoryChips({ project, categories = [], editable = false, onChange, className = '' }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const allIds = projectAllCategoryIds(project);
  const primaryId = project?.category_id || null;
  const extras = project?.extra_category_ids || [];

  const removeExtra = (id) => {
    if (!onChange) return;
    const next = extras.filter(x => x !== id);
    onChange({ category_id: primaryId, extra_category_ids: next });
  };

  const promoteToPrimary = (id) => {
    if (!onChange) return;
    // Si ya hay primaria, la enviamos al final de extras (preserva data).
    const next = [...extras.filter(x => x !== id)];
    if (primaryId) next.push(primaryId);
    onChange({ category_id: id, extra_category_ids: next });
  };

  const addExtra = (id) => {
    if (!onChange || !id) return;
    if (id === primaryId) return;
    if (extras.includes(id)) return;
    onChange({ category_id: primaryId, extra_category_ids: [...extras, id] });
    setPickerOpen(false);
  };

  const available = categories.filter(c => !allIds.includes(c.id));

  if (allIds.length === 0 && !editable) {
    return <span className="text-ink-400 italic text-[11px]">Sin tipo</span>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {primaryId && (
        <CategoryChip
          name={categories.find(c => c.id === primaryId)?.name || '—'}
          primary
          editable={false}
        />
      )}
      {extras.map(id => {
        const cat = categories.find(c => c.id === id);
        if (!cat) return null;
        return (
          <CategoryChip
            key={id}
            name={cat.name}
            primary={false}
            editable={editable}
            onPromote={() => promoteToPrimary(id)}
            onRemove={() => removeExtra(id)}
          />
        );
      })}
      {editable && available.length > 0 && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-violet-700 bg-violet-50 border border-dashed border-violet-300 hover:bg-violet-100 rounded-full px-2.5 py-1 transition"
            title="Añadir tipo secundario"
          >
            <Plus className="w-3 h-3" /> tipo
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute z-40 top-full left-0 mt-1 bg-white border border-ink-200 rounded-xl shadow-lg min-w-[180px] py-1 max-h-60 overflow-y-auto scroller">
                {available.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addExtra(c.id)}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-ink-700 hover:bg-violet-50 hover:text-violet-700 transition"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ name, primary, editable, onPromote, onRemove }) {
  const base = primary
    ? 'bg-violet-600 text-white border-violet-700'
    : 'bg-violet-50 text-violet-700 border-violet-200';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest border rounded-full pl-2.5 pr-1.5 py-1 ${base}`}
      title={primary ? `Tipo principal: ${name}` : `Tipo secundario: ${name}`}
    >
      <span>{name}</span>
      {editable && !primary && (
        <>
          <button
            type="button"
            onClick={onPromote}
            title="Hacer principal"
            className="hover:bg-white/50 rounded-full px-1 text-[9px]"
          >
            ★
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Quitar"
            className="hover:bg-white/50 rounded-full p-0.5"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </>
      )}
    </span>
  );
}
