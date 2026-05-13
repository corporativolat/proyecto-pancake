import { useEffect, useRef, useState } from 'react';
import { Search, Plus, Check, ChevronDown, X, Copy, Building2 } from 'lucide-react';
import { fetchClients, createClient } from '../lib/clients';
import { useToast } from '../lib/toast';

// Combobox de clientes. value = client_id (uuid o ''). onChange(id, name).
// "+ Crear nuevo" abre form inline → llama edge fn admin-create-client.
export default function ClientPicker({ value, onChange, placeholder = 'Selecciona o crea un cliente' }) {
  const showToast = useToast(s => s.show);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try { setClients(await fetchClients()); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selected = clients.find(c => c.id === value);
  const filtered = clients.filter(c =>
    !q ||
    c.name?.toLowerCase().includes(q.toLowerCase()) ||
    c.email?.toLowerCase().includes(q.toLowerCase()) ||
    c.company?.toLowerCase().includes(q.toLowerCase())
  );

  const pick = (c) => {
    onChange(c.id, c.name);
    setOpen(false);
    setQ('');
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange('', '');
  };

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input-light flex items-center justify-between gap-2 w-full text-left">
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
              {(selected.name || selected.email).slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate font-bold">{selected.name}</span>
            {selected.company && <span className="text-[10px] text-ink-400 truncate hidden sm:inline">· {selected.company}</span>}
          </span>
        ) : (
          <span className="text-ink-400 font-medium">{placeholder}</span>
        )}
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && <span onClick={clear} className="p-0.5 hover:text-red-500 transition" title="Limpiar"><X className="w-3.5 h-3.5" /></span>}
          <ChevronDown className={`w-4 h-4 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-2xl shadow-2xl overflow-hidden">
          {!creating && (
            <>
              <div className="relative border-b">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm outline-none bg-transparent" />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-xs text-ink-400">Cargando…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-center">
                    <Building2 className="w-6 h-6 mx-auto mb-2 text-ink-300" />
                    <p className="text-xs text-ink-500">{q ? `Sin resultados para "${q}"` : 'Aún no hay clientes'}</p>
                  </div>
                ) : (
                  <ul className="py-1">
                    {filtered.map(c => {
                      const isSel = c.id === value;
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => pick(c)}
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition ${isSel ? 'bg-emerald-50' : 'hover:bg-ink-50'}`}>
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                              {(c.name || c.email).slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold truncate">{c.name}</div>
                              <div className="text-[10px] text-ink-400 truncate">{c.email}{c.company ? ` · ${c.company}` : ''}</div>
                            </div>
                            {isSel && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <button type="button" onClick={() => setCreating(true)}
                className="w-full border-t px-3 py-2.5 text-left flex items-center gap-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition">
                <Plus className="w-4 h-4" />
                <span>Crear nuevo cliente {q && `"${q}"`}</span>
              </button>
            </>
          )}
          {creating && (
            <InlineCreate
              defaultName={q}
              onCancel={() => setCreating(false)}
              onCreated={async (newId, newName) => {
                await load();
                onChange(newId, newName);
                setOpen(false);
                setCreating(false);
                setQ('');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InlineCreate({ defaultName = '', onCancel, onCreated }) {
  const showToast = useToast(s => s.show);
  const [form, setForm] = useState(() => ({
    name: defaultName,
    email: '',
    phone: '',
    company: '',
    password: genPwd()
  }));
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createClient(form);
      showToast('Cliente creado', 'success');
      onCreated(res.id, form.name);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally { setBusy(false); }
  };

  const copyCreds = async () => {
    const portalUrl = `${window.location.origin}/portal`;
    const msg = `Hola ${form.name},\n\nTe creamos un acceso al portal de Pancake.\n\n🔗 Portal: ${portalUrl}\n👤 Email: ${form.email}\n🔑 Contraseña temporal: ${form.password}\n\nTe recomendamos cambiar la contraseña al ingresar.`;
    try {
      await navigator.clipboard.writeText(msg);
      showToast('Credenciales copiadas', 'success');
    } catch { showToast('No se pudo copiar', 'error'); }
  };

  return (
    <form onSubmit={submit} className="p-3 space-y-2.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1 px-1">Nuevo cliente</div>
      <input required placeholder="Nombre *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-light text-sm" />
      <input required type="email" placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-light text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-light text-sm" />
        <input placeholder="Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="input-light text-sm" />
      </div>
      <div className="flex gap-2">
        <input
          type={showPwd ? 'text' : 'password'}
          required minLength={8}
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          className="input-light text-sm flex-1 font-mono"
        />
        <button type="button" onClick={() => setShowPwd(s => !s)} className="btn-soft text-[10px]" title={showPwd ? 'Ocultar' : 'Ver'}>
          {showPwd ? 'Ocultar' : 'Ver'}
        </button>
        <button type="button" onClick={() => setForm(f => ({ ...f, password: genPwd() }))} className="btn-soft text-[10px]">Generar</button>
      </div>
      <p className="text-[10px] text-ink-400 leading-snug px-1">El cliente entra al portal en <code className="text-emerald-700 font-mono">/portal</code> con email + contraseña.</p>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-soft flex-1 justify-center text-xs">Cancelar</button>
        <button type="button" onClick={copyCreds} className="btn-soft text-xs" title="Copiar mensaje para enviar">
          <Copy className="w-3 h-3" />
        </button>
        <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center text-xs disabled:opacity-60">
          {busy ? 'Creando…' : 'Crear y seleccionar'}
        </button>
      </div>
    </form>
  );
}

function genPwd() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
