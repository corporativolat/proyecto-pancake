import { useEffect, useState } from 'react';
import { Users, Plus, Search, Mail, Phone, Building2, Pause, Play, Briefcase, X } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { fetchClients, createClient, updateClient, clientProjects, assignClientToProject } from '../lib/clients';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import Modal from '../components/Modal.jsx';

export default function Clients() {
  const { can } = useAuth();
  const showToast = useToast(s => s.show);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [assigning, setAssigning] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setClients(await fetchClients()); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!can('manageClients')) {
    return <div className="p-10 text-ink-400 text-sm">No tienes permiso para gestionar clientes.</div>;
  }

  const filtered = clients.filter(c =>
    !q ||
    c.name?.toLowerCase().includes(q.toLowerCase()) ||
    c.email?.toLowerCase().includes(q.toLowerCase()) ||
    c.company?.toLowerCase().includes(q.toLowerCase())
  );

  const toggleSuspended = async (c) => {
    const ok = await askConfirm({
      title: c.suspended ? 'Reactivar cliente' : 'Suspender cliente',
      message: c.suspended
        ? `Permitir nuevamente el acceso a ${c.name}.`
        : `${c.name} no podrá iniciar sesión hasta que lo reactives.`,
      danger: !c.suspended
    });
    if (!ok) return;
    try {
      await updateClient(c.id, { suspended: !c.suspended });
      showToast('Actualizado', 'success');
      await load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  return (
    <section className="flex-1 overflow-y-auto p-4 md:p-10">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-violet-600" /> Clientes
          </h1>
          <p className="text-sm text-ink-500 mt-1">{filtered.length} de {clients.length} cliente(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" className="bg-white border rounded-xl pl-9 pr-3 py-2 text-sm w-48 outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> Nuevo cliente</button>
        </div>
      </header>

      {loading ? <div className="text-ink-400">Cargando…</div> : filtered.length === 0 ? (
        <div className="bg-white border rounded-2xl p-10 text-center text-ink-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{q ? 'Sin resultados.' : 'Aún no hay clientes. Crea el primero.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className={`bg-white border rounded-2xl p-5 transition ${c.suspended ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                    {(c.name || c.email || 'C').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{c.name}</div>
                    {c.suspended && <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-1.5 py-0.5 rounded">suspendido</span>}
                  </div>
                </div>
              </div>
              <div className="space-y-1 text-[11px] text-ink-500">
                <div className="flex items-center gap-2 truncate"><Mail className="w-3 h-3 flex-shrink-0" /> {c.email}</div>
                {c.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3 flex-shrink-0" /> {c.phone}</div>}
                {c.company && <div className="flex items-center gap-2 truncate"><Building2 className="w-3 h-3 flex-shrink-0" /> {c.company}</div>}
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t">
                <button onClick={() => setAssigning(c)} className="btn-soft text-[10px] flex-1 justify-center">
                  <Briefcase className="w-3 h-3" /> Proyectos
                </button>
                <button onClick={() => toggleSuspended(c)} className="btn-soft text-[10px]">
                  {c.suspended ? <><Play className="w-3 h-3" /> Reactivar</> : <><Pause className="w-3 h-3" /> Suspender</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewClientModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
      {assigning && <AssignProjectsModal client={assigning} onClose={() => setAssigning(null)} />}
    </section>
  );
}

function NewClientModal({ onClose, onCreated }) {
  const showToast = useToast(s => s.show);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', password: '' });
  const [busy, setBusy] = useState(false);

  const genPwd = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#';
    let out = '';
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, password: out }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createClient(form);
      showToast('Cliente creado', 'success');
      onCreated();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title="Nuevo cliente" footer={<></>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre *"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-light" /></Field>
        <Field label="Email *"><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-light" /></Field>
        <Field label="Teléfono"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-light" /></Field>
        <Field label="Empresa"><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="input-light" /></Field>
        <Field label="Contraseña temporal *">
          <div className="flex gap-2">
            <input required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-light flex-1" placeholder="Mín. 8 caracteres" />
            <button type="button" onClick={genPwd} className="btn-soft text-[10px]">Generar</button>
          </div>
          <p className="text-[10px] text-ink-400 mt-1">El cliente podrá cambiarla en su primer ingreso.</p>
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-soft flex-1 justify-center">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {busy ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssignProjectsModal({ client, onClose }) {
  const showToast = useToast(s => s.show);
  const projects = useStore(s => s.projects);
  const refreshProjects = useStore(s => s.refreshProjects);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await clientProjects(client.id);
        if (!cancelled) { setAssigned(list.map(p => p.id)); setLoading(false); }
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    })();
    return () => { cancelled = true; };
  }, [client.id, showToast]);

  const toggle = async (projectId, isAssigned) => {
    try {
      await assignClientToProject(projectId, isAssigned ? null : client.id);
      setAssigned(prev => isAssigned ? prev.filter(x => x !== projectId) : [...prev, projectId]);
      await refreshProjects();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  return (
    <Modal onClose={onClose} title={`Proyectos de ${client.name}`} footer={<></>}>
      {loading ? <div className="text-ink-400 text-sm">Cargando…</div> : (
        <>
          <p className="text-[11px] text-ink-500 mb-3">Marca los proyectos a los que tiene acceso este cliente. Un proyecto solo puede tener un cliente asignado.</p>
          <ul className="max-h-96 overflow-y-auto divide-y border rounded-xl">
            {projects.map(p => {
              const isAssigned = assigned.includes(p.id);
              const takenByOther = !!p.client_id && p.client_id !== client.id;
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isAssigned}
                    disabled={takenByOther}
                    onChange={() => toggle(p.id, isAssigned)}
                    className="accent-violet-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{p.title}</div>
                    <div className="text-[10px] text-ink-400">{p.status}{takenByOther ? ' · ya asignado a otro cliente' : ''}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <button onClick={onClose} className="btn-soft w-full justify-center mt-3"><X className="w-3 h-3" /> Cerrar</button>
        </>
      )}
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1 block">{label}</span>
      {children}
    </label>
  );
}
