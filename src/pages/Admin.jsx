import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Tag, Plus, X, Bug } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { avatarClass } from '../lib/utils';
import Avatar from '../components/Avatar.jsx';
import { staggerIn, reduced } from '../lib/motion';
import { updateProfile, deleteProfile, createCategory, updateCategory, deleteCategory } from '../lib/data';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import Modal from '../components/Modal.jsx';

export default function Admin() {
  const profiles = useStore(s => s.profiles);
  const projects = useStore(s => s.projects);
  const categories = useStore(s => s.categories);
  const refreshProfiles = useStore(s => s.refreshProfiles);
  const refreshCategories = useStore(s => s.refreshCategories);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const ref = useRef(null);
  const showToast = useToast(s => s.show);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (reduced || !ref.current) return;
    staggerIn(ref.current);
  }, [profiles.length, categories.length]);

  const saveUser = async (u) => {
    try {
      await updateProfile(u.id, { name: u.name, role: u.role, avatar: u.avatar });
      await refreshProfiles();
      setEditing(null);
      showToast('✓ Usuario actualizado');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const removeUser = async (id) => {
    if (id === profile.id) { showToast('No puedes eliminarte', 'error'); return; }
    const ok = await askConfirm({ title: 'Eliminar perfil', message: 'Esta acción no borra la cuenta de autenticación. ¿Continuar?', danger: true });
    if (!ok) return;
    try { await deleteProfile(id); await refreshProfiles(); showToast('Perfil eliminado'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const addCat = async () => {
    const colors = ['#7c3aed','#10b981','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899'];
    try { await createCategory('Nueva Categoría', colors[Math.floor(Math.random()*colors.length)]); await refreshCategories(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };
  const removeCat = async (id) => {
    if (projects.some(p => p.category_id === id)) { showToast('Categoría en uso por uno o más proyectos', 'error'); return; }
    const ok = await askConfirm({ title: 'Eliminar categoría', message: '¿Confirmar eliminación?', danger: true });
    if (!ok) return;
    try { await deleteCategory(id); await refreshCategories(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };
  const patchCat = async (id, patch) => {
    try { await updateCategory(id, patch); await refreshCategories(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  return (
    <section ref={ref} className="flex-1 p-10 overflow-y-auto scroller">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">Configuración</p>
            <h2 className="text-4xl font-black text-ink-900 tracking-tight">Administración</h2>
            <p className="text-ink-500 font-medium mt-1">Usuarios, permisos y categorías.</p>
          </div>
          <button onClick={() => navigate('/admin/reports')} className="btn-soft">
            <Bug className="w-3.5 h-3.5" /> Reportes de error
          </button>
        </header>

        <div className="card-light p-7 mb-6" data-stagger>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Usuarios del Sistema
            </h3>
            <span className="text-[10px] text-ink-400">Para crear: que la persona se registre desde el login</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profiles.map(u => {
              const proyectos = projects.filter(p => p.owner_id === u.id || (p.member_ids || []).includes(u.id)).length;
              const roleColor = u.role === 'admin' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md' : u.role === 'gerente' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-600';
              return (
                <div key={u.id} className="p-5 rounded-2xl border border-ink-100 hover:border-violet-200 hover:shadow-md transition group" data-stagger>
                  <div className="flex items-center gap-4 mb-3">
                    <Avatar user={u} size={48} className="!rounded-2xl" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink-900 text-sm truncate">{u.name}</div>
                      <div className="text-[11px] font-semibold text-ink-400 truncate">{u.email}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${roleColor}`}>{u.role}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-ink-100">
                    <span className="text-[11px] font-semibold text-ink-500">{proyectos} proyecto{proyectos !== 1 ? 's' : ''}</span>
                    <div className="flex gap-3">
                      <button onClick={() => setEditing({ ...u })} className="text-violet-600 hover:text-violet-800 text-[11px] font-bold">Editar</button>
                      {u.id !== profile.id && <button onClick={() => removeUser(u.id)} className="text-red-500 hover:text-red-700 text-[11px] font-bold">Eliminar</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-light p-7" data-stagger>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" /> Categorías de Proyecto
            </h3>
            <button onClick={addCat} className="btn-primary-sm"><Plus className="w-3.5 h-3.5" /> NUEVA</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.map(c => {
              const used = projects.filter(p => p.category_id === c.id).length;
              return (
                <div key={c.id} className="p-5 rounded-2xl border border-ink-100 hover:shadow-md transition group relative" data-stagger>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl shadow-md" style={{ background: c.color, boxShadow: `0 4px 14px ${c.color}55` }}></div>
                    <button onClick={() => removeCat(c.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input defaultValue={c.name} onBlur={e => e.target.value !== c.name && patchCat(c.id, { name: e.target.value })} className="text-sm font-bold text-ink-900 bg-transparent border-none focus:ring-0 w-full p-0 mb-2 outline-none" />
                  <div className="flex items-center gap-2 mb-2">
                    <input type="color" defaultValue={c.color} onBlur={e => e.target.value !== c.color && patchCat(c.id, { color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-0" />
                    <span className="text-[10px] font-mono text-ink-400">{c.color}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-ink-500 tabular">{used} proyecto{used !== 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editing && (
        <Modal title="Editar Usuario" onClose={() => setEditing(null)} onSave={() => saveUser(editing)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="input-light" /></Field>
            <Field label="Correo"><input value={editing.email} disabled className="input-light opacity-60" /></Field>
          </div>
          <Field label="Rol">
            <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })} className="input-light">
              <option value="admin">Directivo (Admin)</option>
              <option value="gerente">Gerente</option>
              <option value="miembro">Miembro</option>
            </select>
          </Field>
          <Field label="Avatar">
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => setEditing({ ...editing, avatar: n })} className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold text-xs hover:scale-110 transition shadow-md ${avatarClass(n)} ${editing.avatar === n ? 'ring-4 ring-violet-500 scale-110' : ''}`}>{n}</button>
              ))}
            </div>
          </Field>
          <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl p-4 text-[11px] font-medium text-ink-600 leading-relaxed">
            <strong className="text-violet-700">Permisos:</strong><br />
            <strong>Directivo:</strong> Control total.<br />
            <strong>Gerente:</strong> Crea/edita proyectos, ve KPIs.<br />
            <strong>Miembro:</strong> Solo proyectos propios.
          </div>
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
