import { useEffect, useState } from 'react';
import { Users, Plus, Search, Mail, Phone, Building2, Pause, Play, Briefcase, X, Copy, Link as LinkIcon, Check, MessageCircle, Globe, IdCard, AlertCircle } from 'lucide-react';
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

      <PortalUrlCard />


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
              {!c.client_data_completed && (
                <div className="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  <AlertCircle className="w-3 h-3" /> Datos sin completar
                </div>
              )}
              <div className="space-y-1 text-[11px] text-ink-500">
                <div className="flex items-center gap-2 truncate" title="Email de login"><Mail className="w-3 h-3 flex-shrink-0" /> {c.email}</div>
                {c.contact_email && c.contact_email !== c.email && (
                  <div className="flex items-center gap-2 truncate" title="Email de contacto"><Mail className="w-3 h-3 flex-shrink-0 text-emerald-600" /> <span className="text-emerald-700 font-bold">{c.contact_email}</span></div>
                )}
                {c.whatsapp && <div className="flex items-center gap-2" title="WhatsApp"><MessageCircle className="w-3 h-3 flex-shrink-0 text-emerald-600" /> <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-700 font-bold hover:underline">{c.whatsapp}</a></div>}
                {c.phone && c.phone !== c.whatsapp && <div className="flex items-center gap-2"><Phone className="w-3 h-3 flex-shrink-0" /> {c.phone}</div>}
                {c.country && <div className="flex items-center gap-2 truncate"><Globe className="w-3 h-3 flex-shrink-0" /> {c.country}</div>}
                {c.id_number && <div className="flex items-center gap-2 truncate" title="Identificación"><IdCard className="w-3 h-3 flex-shrink-0" /> <span className="font-mono">{c.id_type || ''} {c.id_number}</span></div>}
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
  const [created, setCreated] = useState(null);
  const portalUrl = `${window.location.origin}/portal`;

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
      setCreated({ name: form.name, email: form.email, password: form.password });
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally { setBusy(false); }
  };

  const close = () => {
    if (created) onCreated();
    else onClose();
  };

  if (created) {
    return (
      <Modal onClose={close} title="Cliente creado ✓" footer={<></>}>
        <CredentialsSummary
          name={created.name}
          email={created.email}
          password={created.password}
          portalUrl={portalUrl}
          onDone={onCreated}
        />
      </Modal>
    );
  }

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
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-[11px] text-ink-600">
          Al crear el cliente verás el enlace del portal y las credenciales listas para copiar y enviar.
        </div>
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

function CredentialsSummary({ name, email, password, portalUrl, onDone }) {
  const showToast = useToast(s => s.show);
  const [copied, setCopied] = useState(false);

  const fullMessage = `Hola ${name},

Te creamos un acceso al portal de Pancake.

🔗 Portal: ${portalUrl}
👤 Email: ${email}
🔑 Contraseña temporal: ${password}

Te recomendamos cambiar la contraseña al ingresar por primera vez.`;

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copiado`, 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopied(true);
      showToast('Mensaje listo para enviar', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[12px] text-emerald-800">
        Guarda estos datos: la contraseña no se mostrará de nuevo. Envíala al cliente por un canal seguro.
      </div>

      <CredentialRow label="Portal" value={portalUrl} onCopy={() => copy(portalUrl, 'Enlace')} />
      <CredentialRow label="Email" value={email} onCopy={() => copy(email, 'Email')} />
      <CredentialRow label="Contraseña" value={password} mono onCopy={() => copy(password, 'Contraseña')} />

      <div className="pt-2 border-t">
        <button onClick={copyAll} className="btn-primary w-full justify-center">
          {copied ? <><Check className="w-4 h-4" /> Mensaje copiado</> : <><Copy className="w-4 h-4" /> Copiar mensaje listo para enviar</>}
        </button>
        <p className="text-[10px] text-ink-400 mt-2 text-center">Incluye saludo + enlace + credenciales.</p>
      </div>

      <button onClick={onDone} className="btn-soft w-full justify-center">Cerrar</button>
    </div>
  );
}

function CredentialRow({ label, value, mono, onCopy }) {
  return (
    <div>
      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1 block">{label}</span>
      <div className="flex gap-2">
        <code className={`flex-1 bg-white border rounded-lg px-3 py-2 text-xs ${mono ? 'font-mono' : ''} text-ink-700 truncate`}>{value}</code>
        <button onClick={onCopy} className="btn-soft text-[10px] flex-shrink-0"><Copy className="w-3 h-3" /> Copiar</button>
      </div>
    </div>
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

function PortalUrlCard() {
  const showToast = useToast(s => s.show);
  const [copied, setCopied] = useState(false);
  const portalUrl = `${window.location.origin}/portal`;

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(`${label} copiado`, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  return (
    <div className="card-light mb-6 p-5 md:p-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/20">
          <LinkIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-400 mb-1">Acceso al portal</div>
          <h3 className="font-black text-base tracking-tight mb-1">URL del portal para clientes</h3>
          <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">Comparte este enlace junto con el email y la contraseña temporal que generaste al crear cada cliente.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 input-light px-3 py-2 text-xs font-mono text-violet-700 truncate flex items-center">{portalUrl}</code>
            <button onClick={() => copy(portalUrl, 'Enlace')} className="btn-primary text-xs flex-shrink-0 justify-center">
              {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar enlace</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
