import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Flag, FileText, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const STATUS_COLOR = {
  'No iniciado':  'bg-ink-100 text-ink-600',
  'En progreso':  'bg-violet-100 text-violet-700',
  'Pausado':      'bg-amber-100 text-amber-700',
  'En revisión':  'bg-blue-100 text-blue-700',
  'Finalizado':   'bg-emerald-100 text-emerald-700'
};

// Detalle del proyecto desde el portal cliente: vista de solo-lectura
// (sin edición de fases/tasks), con timeline de hitos y comentarios.
export default function PortalProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: pj } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
      const { data: ph } = await supabase.from('phases').select('id, name, position').eq('project_id', id).order('position');
      const { data: ms } = await supabase.from('milestones').select('id, name, target_date, completed').eq('project_id', id).order('target_date');
      if (!cancelled) {
        setProject(pj);
        setPhases(ph || []);
        setMilestones(ms || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="p-10 text-ink-400">Cargando…</div>;
  if (!project) return (
    <div className="p-10">
      <button onClick={() => navigate('/portal/projects')} className="text-emerald-700 font-bold text-sm flex items-center gap-2 mb-4"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <p className="text-ink-400">Proyecto no encontrado o sin acceso.</p>
    </div>
  );

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <button onClick={() => navigate('/portal/projects')} className="text-ink-500 font-bold text-xs flex items-center gap-2 mb-4 hover:text-ink-700"><ArrowLeft className="w-3.5 h-3.5" /> Proyectos</button>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex-1">{project.title}</h1>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${STATUS_COLOR[project.status] || 'bg-ink-100 text-ink-600'}`}>{project.status}</span>
        </div>
        {project.goal && <p className="text-sm text-ink-600 leading-relaxed">{project.goal}</p>}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-500 flex-wrap">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.start_date || 'Sin inicio'}</span>
          <span>→</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.projected_end_date || 'Sin fin'}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border rounded-2xl p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-3 flex items-center gap-2"><Flag className="w-3.5 h-3.5" /> Hitos</h2>
          {milestones.length === 0 ? (
            <p className="text-xs text-ink-400">Sin hitos definidos.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map(m => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.completed ? 'bg-emerald-500' : 'bg-ink-300'}`} />
                  <span className={`flex-1 ${m.completed ? 'line-through text-ink-400' : 'font-bold'}`}>{m.name}</span>
                  <span className="text-[11px] text-ink-400 tabular">{m.target_date || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border rounded-2xl p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Etapas</h2>
          {phases.length === 0 ? (
            <p className="text-xs text-ink-400">Sin etapas.</p>
          ) : (
            <ol className="space-y-2">
              {phases.map((ph, i) => (
                <li key={ph.id} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span className="font-bold">{ph.name}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {project.observation && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-amber-700 mb-2 flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Observaciones</h2>
          <p className="text-sm text-amber-900 leading-relaxed italic">{project.observation}</p>
        </div>
      )}
    </section>
  );
}
