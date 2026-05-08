import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, ChevronLeft, Filter, Trash2, ExternalLink } from 'lucide-react';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { fetchErrorReports, updateErrorReport, deleteErrorReport } from '../lib/reports';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';

const STATUS = {
  open: { label: 'Abierto', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'En curso', cls: 'bg-violet-100 text-violet-700' },
  resolved: { label: 'Resuelto', cls: 'bg-emerald-100 text-emerald-700' },
  wontfix: { label: 'No se arreglará', cls: 'bg-ink-100 text-ink-500' },
};
const SEV = {
  low: { label: 'Baja', cls: 'text-emerald-500' },
  normal: { label: 'Normal', cls: 'text-ink-500' },
  high: { label: 'Alta', cls: 'text-amber-500' },
  urgent: { label: 'Urgente', cls: 'text-red-500' },
};

export default function AdminReports() {
  const navigate = useNavigate();
  const showToast = useToast(s => s.show);
  const [reports, setReports] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setReports(await fetchErrorReports({ scope })); }
    catch (e) { showToast('Error al cargar: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [scope]);

  const setStatus = async (id, status) => {
    try { await updateErrorReport(id, { status }); await load(); showToast('✓ Estado actualizado'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const remove = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar reporte', message: '¿Confirmar eliminación permanente?', danger: true });
    if (!ok) return;
    try { await deleteErrorReport(id); setSelected(null); await load(); showToast('Reporte eliminado'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/admin')} className="text-[11px] font-bold text-ink-500 hover:text-violet-600 flex items-center gap-1 mb-3">
          <ChevronLeft className="w-3 h-3" /> Volver a Administración
        </button>
        <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-3">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">Soporte</p>
            <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight flex items-center gap-3">
              <Bug className="w-7 h-7 md:w-9 md:h-9 text-red-500" /> Reportes de error
            </h2>
            <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">Issues enviados por usuarios desde el botón flotante.</p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-2xl p-1 border border-ink-100 self-start md:self-auto overflow-x-auto">
            <Filter className="w-3.5 h-3.5 text-ink-400 ml-2" />
            <button onClick={() => setScope('all')} className={`text-[11px] font-bold px-3 py-1.5 rounded-xl ${scope === 'all' ? 'bg-violet-100 text-violet-700' : 'text-ink-500'}`}>Todos</button>
            <button onClick={() => setScope('open')} className={`text-[11px] font-bold px-3 py-1.5 rounded-xl ${scope === 'open' ? 'bg-violet-100 text-violet-700' : 'text-ink-500'}`}>Abiertos</button>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-ink-400">Cargando…</p>
        ) : reports.length === 0 ? (
          <div className="card-light p-12 text-center text-ink-400 text-sm">
            Sin reportes {scope === 'open' ? 'abiertos' : ''} por ahora.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(r => {
              const st = STATUS[r.status] || STATUS.open;
              const sv = SEV[r.severity] || SEV.normal;
              return (
                <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left card-light p-5 hover:shadow-md transition flex items-center gap-4">
                  <Avatar user={r.profile} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${sv.cls}`}>{sv.label}</span>
                      <span className="text-ink-300">·</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </div>
                    <h4 className="font-bold text-ink-900 text-sm truncate">{r.title}</h4>
                    <p className="text-[11px] text-ink-500 truncate mt-0.5">
                      {r.profile?.name || '—'} · {fmt(r.created_at)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <Modal
          title={selected.title}
          onClose={() => setSelected(null)}
          maxWidth="max-w-2xl"
          footer={(
            <>
              <button onClick={() => remove(selected.id)} className="btn-danger mr-auto"><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>
              <button onClick={() => setSelected(null)} className="btn-ghost">Cerrar</button>
            </>
          )}
        >
          <div className="flex items-center gap-3 mb-3">
            <Avatar user={selected.profile} size={36} />
            <div>
              <div className="text-sm font-bold">{selected.profile?.name || '—'}</div>
              <div className="text-[11px] text-ink-400">{selected.profile?.email} · {fmt(selected.created_at)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <select value={selected.status} onChange={e => { const s = e.target.value; setSelected({ ...selected, status: s }); setStatus(selected.id, s); }} className="input-light">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Severidad">
              <input value={SEV[selected.severity]?.label || selected.severity} disabled className="input-light opacity-60" />
            </Field>
          </div>

          <Field label="Descripción">
            <p className="text-sm bg-ink-50 rounded-xl p-3 text-ink-700 whitespace-pre-wrap leading-relaxed">{selected.description}</p>
          </Field>

          {selected.page_url && (
            <Field label="URL al reportar">
              <a href={selected.page_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-800 break-all flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> {selected.page_url}
              </a>
            </Field>
          )}

          {selected.user_agent && (
            <Field label="User agent">
              <p className="text-[10px] font-mono text-ink-500 bg-ink-50 rounded-lg p-2 break-all">{selected.user_agent}</p>
            </Field>
          )}
        </Modal>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{label}</label>
      {children}
    </div>
  );
}
