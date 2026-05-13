import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Tag, Plus, X, Bug, Flag, FileText } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { avatarClass } from '../lib/utils';
import Avatar from '../components/Avatar.jsx';
import { staggerIn, reduced } from '../lib/motion';
import {
  updateProfile, deleteProfile,
  createCategory, updateCategory, deleteCategory,
  fetchMilestoneTemplates, createMilestoneTemplate, updateMilestoneTemplate, deleteMilestoneTemplate,
  fetchDocumentTemplates, createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate
} from '../lib/data';
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
  const { t } = useT();
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
      showToast(t('admin.toast.userSaved'));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const removeUser = async (id) => {
    if (id === profile.id) { showToast(t('admin.toast.cannotDeleteSelf'), 'error'); return; }
    const ok = await askConfirm({ title: t('admin.confirm.deleteProfileTitle'), message: t('admin.confirm.deleteProfileMsg'), danger: true });
    if (!ok) return;
    try { await deleteProfile(id); await refreshProfiles(); showToast(t('admin.toast.profileDeleted')); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const addCat = async () => {
    const colors = ['#7c3aed','#10b981','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899'];
    try { await createCategory(t('admin.cat.newName'), colors[Math.floor(Math.random()*colors.length)]); await refreshCategories(); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };
  const removeCat = async (id) => {
    if (projects.some(p => p.category_id === id)) { showToast(t('admin.cat.inUse'), 'error'); return; }
    const ok = await askConfirm({ title: t('admin.confirm.deleteCatTitle'), message: t('admin.confirm.deleteCatMsg'), danger: true });
    if (!ok) return;
    try { await deleteCategory(id); await refreshCategories(); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };
  const patchCat = async (id, patch) => {
    try { await updateCategory(id, patch); await refreshCategories(); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <section ref={ref} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 md:mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-3">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">{t('admin.section')}</p>
            <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">{t('admin.title')}</h2>
            <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">{t('admin.subtitle')}</p>
          </div>
          <button onClick={() => navigate('/admin/reports')} className="btn-soft self-start md:self-auto">
            <Bug className="w-3.5 h-3.5" /> {t('admin.errorReports')}
          </button>
        </header>

        <div className="card-light p-7 mb-6" data-stagger>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> {t('admin.users')}
            </h3>
            <span className="text-[10px] text-ink-400">{t('admin.usersHint')}</span>
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
                    <span className="text-[11px] font-semibold text-ink-500">{proyectos} {proyectos !== 1 ? t('admin.projectsCount.many') : t('admin.projectsCount.one')}</span>
                    <div className="flex gap-3">
                      <button onClick={() => setEditing({ ...u })} className="text-violet-600 hover:text-violet-800 text-[11px] font-bold">{t('admin.edit')}</button>
                      {u.id !== profile.id && <button onClick={() => removeUser(u.id)} className="text-red-500 hover:text-red-700 text-[11px] font-bold">{t('admin.delete')}</button>}
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
              <Tag className="w-3.5 h-3.5" /> {t('admin.categories')}
            </h3>
            <button onClick={addCat} className="btn-primary-sm"><Plus className="w-3.5 h-3.5" /> {t('admin.newCategory')}</button>
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
                  <div className="text-[11px] font-semibold text-ink-500 tabular">{used} {used !== 1 ? t('admin.projectsCount.many') : t('admin.projectsCount.one')}</div>
                </div>
              );
            })}
          </div>
        </div>

        <MilestoneTemplatesSection categories={categories} />
        <DocumentTemplatesSection categories={categories} />
      </div>

      {editing && (
        <Modal title={t('admin.userModal.title')} onClose={() => setEditing(null)} onSave={() => saveUser(editing)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin.field.name')}><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="input-light" /></Field>
            <Field label={t('admin.field.email')}><input value={editing.email} disabled className="input-light opacity-60" /></Field>
          </div>
          <Field label={t('admin.field.role')}>
            <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })} className="input-light">
              <option value="admin">{t('admin.role.admin')}</option>
              <option value="gerente">{t('admin.role.gerente')}</option>
              <option value="miembro">{t('admin.role.miembro')}</option>
            </select>
          </Field>
          <Field label={t('admin.field.avatar')}>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => setEditing({ ...editing, avatar: n })} className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold text-xs hover:scale-110 transition shadow-md ${avatarClass(n)} ${editing.avatar === n ? 'ring-4 ring-violet-500 scale-110' : ''}`}>{n}</button>
              ))}
            </div>
          </Field>
          <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl p-4 text-[11px] font-medium text-ink-600 leading-relaxed">
            <strong className="text-violet-700">{t('admin.perms.title')}</strong><br />
            <strong>{t('admin.perms.adminLine')}</strong> {t('admin.perms.adminDesc')}<br />
            <strong>{t('admin.perms.gerenteLine')}</strong> {t('admin.perms.gerenteDesc')}<br />
            <strong>{t('admin.perms.miembroLine')}</strong> {t('admin.perms.miembroDesc')}
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

function MilestoneTemplatesSection({ categories }) {
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await fetchMilestoneTemplates();
      setItems(rows || []);
    } catch (e) {
      showToast(t('common.errorPrefix') + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const add = async (categoryId) => {
    try {
      await createMilestoneTemplate({
        category_id: categoryId,
        name: t('admin.tpl.newName'),
        days_after_start: 7,
        position: items.filter(i => i.category_id === categoryId).length
      });
      await reload();
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const patch = async (id, change) => {
    try {
      await updateMilestoneTemplate(id, change);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...change } : i));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const remove = async (id) => {
    const ok = await askConfirm({ title: t('admin.tpl.deleteTitle'), message: t('admin.tpl.deleteMsg'), danger: true });
    if (!ok) return;
    try {
      await deleteMilestoneTemplate(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <div className="card-light p-7 mt-6" data-stagger>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <Flag className="w-3.5 h-3.5" /> {t('admin.tpl.section')}
        </h3>
        <span className="text-[10px] text-ink-400">{t('admin.tpl.hint')}</span>
      </div>
      {loading && <p className="text-xs text-ink-400 italic">{t('common.loading')}</p>}
      {!loading && categories.length === 0 && (
        <p className="text-xs text-ink-400 italic">{t('admin.tpl.noCategories')}</p>
      )}
      <div className="space-y-5">
        {categories.map(cat => {
          const tpls = items.filter(i => i.category_id === cat.id);
          return (
            <div key={cat.id} className="rounded-2xl border border-ink-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-sm font-black text-ink-800">{cat.name}</span>
                  <span className="text-[10px] font-bold text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full tabular">{tpls.length}</span>
                </div>
                <button onClick={() => add(cat.id)} className="btn-primary-sm">
                  <Plus className="w-3.5 h-3.5" /> {t('admin.tpl.add')}
                </button>
              </div>
              {tpls.length === 0
                ? <p className="text-[11px] text-ink-400 italic">{t('admin.tpl.empty')}</p>
                : (
                  <div className="space-y-2">
                    {tpls.map(tpl => (
                      <div key={tpl.id} className="flex items-center gap-2 group">
                        <input
                          defaultValue={tpl.name}
                          onBlur={e => e.target.value !== tpl.name && patch(tpl.id, { name: e.target.value.trim() || tpl.name })}
                          className="input-light flex-1 text-xs"
                          placeholder={t('admin.tpl.namePlaceholder')}
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            defaultValue={tpl.days_after_start}
                            onBlur={e => {
                              const v = parseInt(e.target.value);
                              if (!Number.isNaN(v) && v !== tpl.days_after_start) patch(tpl.id, { days_after_start: v });
                            }}
                            className="input-light text-xs w-20 tabular"
                          />
                          <span className="text-[10px] font-bold text-ink-400">{t('admin.tpl.days')}</span>
                        </div>
                        <input
                          type="color"
                          defaultValue={tpl.color}
                          onBlur={e => e.target.value !== tpl.color && patch(tpl.id, { color: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer border-0"
                        />
                        <button onClick={() => remove(tpl.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DOC_KINDS = ['generico', 'cedula', 'branding', 'accesos', 'logos', 'contrato', 'otro'];
const TRIGGER_STATUSES = ['', 'No iniciado', 'En progreso', 'En revisión', 'Pausado', 'Finalizado'];

function DocumentTemplatesSection({ categories }) {
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try { setItems(await fetchDocumentTemplates() || []); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const add = async (categoryId) => {
    try {
      await createDocumentTemplate({
        category_id: categoryId,
        name: 'Nuevo documento',
        kind: 'generico',
        required: true,
        trigger_status: null,
        position: items.filter(i => i.category_id === categoryId).length
      });
      await reload();
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const patch = async (id, change) => {
    try {
      await updateDocumentTemplate(id, change);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...change } : i));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const remove = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar plantilla', message: '¿Eliminar esta plantilla de documento?', danger: true });
    if (!ok) return;
    try {
      await deleteDocumentTemplate(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <div className="card-light p-7 mt-6" data-stagger>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> Plantillas de documentos por categoría
        </h3>
        <span className="text-[10px] text-ink-400">Se auto-crean en cada proyecto al entrar al estado configurado.</span>
      </div>
      {loading && <p className="text-xs text-ink-400 italic">{t('common.loading')}</p>}
      {!loading && categories.length === 0 && <p className="text-xs text-ink-400 italic">Sin categorías.</p>}
      <div className="space-y-5">
        {categories.map(cat => {
          const tpls = items.filter(i => i.category_id === cat.id);
          return (
            <div key={cat.id} className="rounded-2xl border border-ink-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-sm font-black text-ink-800">{cat.name}</span>
                  <span className="text-[10px] font-bold text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full tabular">{tpls.length}</span>
                </div>
                <button onClick={() => add(cat.id)} className="btn-primary-sm">
                  <Plus className="w-3.5 h-3.5" /> Documento
                </button>
              </div>
              {tpls.length === 0 ? (
                <p className="text-[11px] text-ink-400 italic">Sin plantillas.</p>
              ) : (
                <div className="space-y-2">
                  {tpls.map(tpl => (
                    <div key={tpl.id} className="grid grid-cols-12 gap-2 items-center group">
                      <input
                        defaultValue={tpl.name}
                        onBlur={e => e.target.value !== tpl.name && patch(tpl.id, { name: e.target.value.trim() || tpl.name })}
                        className="input-light text-xs col-span-4"
                        placeholder="Nombre"
                      />
                      <select
                        defaultValue={tpl.kind}
                        onChange={e => patch(tpl.id, { kind: e.target.value })}
                        className="input-light text-xs col-span-2"
                      >
                        {DOC_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <select
                        defaultValue={tpl.trigger_status || ''}
                        onChange={e => patch(tpl.id, { trigger_status: e.target.value || null })}
                        className="input-light text-xs col-span-3"
                        title="Estado del proyecto que dispara la creación (vacío = al crear)"
                      >
                        {TRIGGER_STATUSES.map(s => <option key={s} value={s}>{s || '— al crear proyecto —'}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-600 col-span-2 cursor-pointer">
                        <input type="checkbox" checked={tpl.required} onChange={e => patch(tpl.id, { required: e.target.checked })} className="accent-violet-600" />
                        Obligatorio
                      </label>
                      <button onClick={() => remove(tpl.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition justify-self-end col-span-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
