import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Tag, Plus, X, Bug, Flag, FileText, Layers, ClipboardList, Pencil, Upload, Trash2 } from 'lucide-react';
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
import {
  fetchPlatforms, createPlatform, updatePlatform, deletePlatform,
  fetchQuestionnaireTemplates, createQuestionnaireTemplate, updateQuestionnaireTemplate, deleteQuestionnaireTemplate
} from '../lib/questionnaires';
import { uploadPlatformImage, removePlatformImage } from '../lib/storage';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import Modal from '../components/Modal.jsx';
import QuestionnaireEditor from '../components/QuestionnaireEditor.jsx';

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
        <PlatformsSection />
        <QuestionnaireTemplatesSection />
      </div>

      {editing && (
        <Modal title={t('admin.userModal.title')} onClose={() => setEditing(null)} onSave={() => saveUser(editing)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin.field.name')}><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="input-light" /></Field>
            <Field label={t('admin.field.email')}><input value={editing.email} disabled className="input-light opacity-60" /></Field>
          </div>
          <Field label={t('admin.field.role')}>
            <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })} className="input-light">
              {/* Lista canónica de roles staff. `cliente` se gestiona desde la página
                  de Clientes; `super_admin` solo se asigna por SQL. Mostramos super_admin
                  como opción solo si el usuario actual ya lo es para no perder el rol al
                  editar a otro super_admin. */}
              {(profile?.role === 'super_admin' || editing.role === 'super_admin') && (
                <option value="super_admin">{t('admin.role.superAdmin') || 'Super admin'}</option>
              )}
              <option value="admin">{t('admin.role.admin')}</option>
              <option value="gerente">{t('admin.role.gerente')}</option>
              <option value="lider_equipos">{t('admin.role.liderEquipos') || 'Líder de equipos'}</option>
              <option value="lider_equipo">{t('admin.role.liderEquipo') || 'Líder del equipo'}</option>
              <option value="miembro">{t('admin.role.miembro')}</option>
              {editing.role === 'cliente' && (
                <option value="cliente">{t('admin.role.cliente') || 'Cliente'}</option>
              )}
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

// =============================================================
// PLATFORMS (mig-29) — catálogo de productos Pancake al que se anclan
// los cuestionarios. Solo admin.
// =============================================================
const PLATFORM_COLORS = ['#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#ef4444','#10b981','#f97316','#6366f1'];

function PlatformsSection() {
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try { setItems(await fetchPlatforms() || []); }
    catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const add = async () => {
    try {
      await createPlatform({
        slug: 'nueva-' + Math.random().toString(36).slice(2, 6),
        name: 'Nueva plataforma',
        description: '',
        icon: '✨',
        color: PLATFORM_COLORS[items.length % PLATFORM_COLORS.length],
        position: items.length
      });
      await reload();
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const patch = async (id, change) => {
    try {
      await updatePlatform(id, change);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...change } : i));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const remove = async (id) => {
    const target = items.find(i => i.id === id);
    const ok = await askConfirm({ title: 'Eliminar plataforma', message: 'Se borrarán también todas sus plantillas de cuestionario. ¿Continuar?', danger: true });
    if (!ok) return;
    try {
      if (target?.image_url) { try { await removePlatformImage(target.image_url); } catch { /* ignore */ } }
      await deletePlatform(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const onImagePick = async (p, file) => {
    if (!file) return;
    try {
      if (p.image_url) { try { await removePlatformImage(p.image_url); } catch { /* ignore */ } }
      const url = await uploadPlatformImage(p.id, file);
      await patch(p.id, { image_url: url });
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const onImageRemove = async (p) => {
    if (!p.image_url) return;
    try {
      try { await removePlatformImage(p.image_url); } catch { /* ignore */ }
      await patch(p.id, { image_url: null });
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <div className="card-light p-7 mt-6" data-stagger>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" /> Plataformas
        </h3>
        <button onClick={add} className="btn-primary-sm"><Plus className="w-3.5 h-3.5" /> Plataforma</button>
      </div>
      <p className="text-[11px] text-ink-400 italic mb-4">Productos Pancake a los que se anclan los cuestionarios (Botcake, CRM, Pancake…).</p>

      {loading && <p className="text-xs text-ink-400 italic">Cargando…</p>}
      {!loading && items.length === 0 && <p className="text-xs text-ink-400 italic">Aún no hay plataformas.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(p => (
          <div key={p.id} className="p-4 rounded-2xl border border-ink-100 hover:shadow-md transition group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-sm overflow-hidden" style={{ background: p.color + '22', color: p.color }}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <span>{p.icon || '🔹'}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  defaultValue={p.name}
                  onBlur={e => e.target.value !== p.name && patch(p.id, { name: e.target.value.trim() || p.name })}
                  className="w-full text-sm font-black text-ink-900 bg-transparent border-0 outline-none p-0"
                />
                <input
                  defaultValue={p.slug}
                  onBlur={e => {
                    const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                    if (v && v !== p.slug) patch(p.id, { slug: v });
                  }}
                  className="w-full text-[10px] font-mono text-ink-400 bg-transparent border-0 outline-none p-0 lowercase"
                />
              </div>
              <button onClick={() => remove(p.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <textarea
              defaultValue={p.description || ''}
              onBlur={e => e.target.value !== p.description && patch(p.id, { description: e.target.value })}
              placeholder="Descripción breve…"
              rows={2}
              className="input-light text-xs resize-y w-full mb-2"
            />

            <div className="flex items-center gap-2 flex-wrap">
              <input
                defaultValue={p.icon || ''}
                onBlur={e => e.target.value !== p.icon && patch(p.id, { icon: e.target.value.slice(0, 4) })}
                placeholder="emoji"
                className="input-light text-sm w-16 text-center"
                maxLength={4}
                title="Se usa cuando no hay imagen"
              />
              <input
                type="color"
                defaultValue={p.color}
                onBlur={e => e.target.value !== p.color && patch(p.id, { color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border-0"
              />
              <label className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-600 cursor-pointer px-2 py-1 rounded-lg border border-ink-200 hover:border-violet-400 hover:text-violet-700 transition">
                <Upload className="w-3 h-3" />
                {p.image_url ? 'Cambiar' : 'Imagen'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImagePick(p, f); }}
                />
              </label>
              {p.image_url && (
                <button
                  type="button"
                  onClick={() => onImageRemove(p)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-500 hover:text-red-600 px-2 py-1 rounded-lg border border-ink-200 hover:border-red-300 transition"
                  title="Quitar imagen"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-600 cursor-pointer ml-auto">
                <input type="checkbox" checked={p.active} onChange={e => patch(p.id, { active: e.target.checked })} className="accent-violet-600" />
                Activa
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================
// QUESTIONNAIRE TEMPLATES (mig-29) — plantillas por plataforma.
// =============================================================
function QuestionnaireTemplatesSection() {
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [platforms, setPlatforms] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [pls, tps] = await Promise.all([fetchPlatforms(), fetchQuestionnaireTemplates()]);
      setPlatforms(pls || []);
      setItems(tps || []);
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const add = async (platformId) => {
    try {
      const created = await createQuestionnaireTemplate({
        platform_id: platformId,
        name: 'Nuevo cuestionario',
        description: '',
        body: { sections: [] },
        position: items.filter(i => i.platform_id === platformId).length,
        active: true
      });
      await reload();
      setEditing(created);
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const patch = async (id, change) => {
    try {
      await updateQuestionnaireTemplate(id, change);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...change } : i));
      if (editing?.id === id) setEditing(prev => ({ ...prev, ...change }));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  const remove = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar plantilla', message: '¿Eliminar esta plantilla? Los cuestionarios ya enviados a proyectos no se ven afectados (son copias).', danger: true });
    if (!ok) return;
    try {
      await deleteQuestionnaireTemplate(id);
      setItems(prev => prev.filter(i => i.id !== id));
      if (editing?.id === id) setEditing(null);
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <div className="card-light p-7 mt-6" data-stagger>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" /> Plantillas de cuestionarios
        </h3>
        <span className="text-[10px] text-ink-400">Una plantilla pertenece a una plataforma.</span>
      </div>

      {loading && <p className="text-xs text-ink-400 italic">Cargando…</p>}
      {!loading && platforms.length === 0 && <p className="text-xs text-ink-400 italic">Crea primero una plataforma.</p>}

      <div className="space-y-5">
        {platforms.map(pl => {
          const tpls = items.filter(i => i.platform_id === pl.id);
          return (
            <div key={pl.id} className="rounded-2xl border border-ink-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm overflow-hidden" style={{ background: pl.color + '22', color: pl.color }}>
                    {pl.image_url
                      ? <img src={pl.image_url} alt={pl.name} className="w-full h-full object-cover" />
                      : (pl.icon || '🔹')}
                  </span>
                  <span className="text-sm font-black text-ink-800">{pl.name}</span>
                  <span className="text-[10px] font-bold text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full tabular">{tpls.length}</span>
                </div>
                <button onClick={() => add(pl.id)} className="btn-primary-sm">
                  <Plus className="w-3.5 h-3.5" /> Cuestionario
                </button>
              </div>

              {tpls.length === 0 ? (
                <p className="text-[11px] text-ink-400 italic">Sin plantillas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {tpls.map(tpl => {
                    const qCount = (tpl.body?.sections || []).reduce((acc, s) => acc + (s.questions?.length || 0), 0);
                    return (
                      <div key={tpl.id} className="grid grid-cols-12 gap-2 items-center group">
                        <input
                          defaultValue={tpl.name}
                          onBlur={e => e.target.value !== tpl.name && patch(tpl.id, { name: e.target.value.trim() || tpl.name })}
                          className="input-light text-xs col-span-4"
                          placeholder="Nombre"
                        />
                        <input
                          defaultValue={tpl.description || ''}
                          onBlur={e => e.target.value !== tpl.description && patch(tpl.id, { description: e.target.value })}
                          className="input-light text-xs col-span-4"
                          placeholder="Descripción"
                        />
                        <span className="text-[10px] font-bold text-ink-500 col-span-1 tabular text-center">{qCount} P</span>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-ink-600 col-span-1 cursor-pointer">
                          <input type="checkbox" checked={tpl.active} onChange={e => patch(tpl.id, { active: e.target.checked })} className="accent-violet-600" />
                          Activa
                        </label>
                        <div className="col-span-2 flex items-center gap-1 justify-end">
                          <button onClick={() => setEditing(tpl)} className="text-violet-600 hover:text-violet-900 text-[11px] font-bold inline-flex items-center gap-1" title="Editar contenido">
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button onClick={() => remove(tpl.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal
          title={`Editor — ${editing.name}`}
          maxWidth="max-w-5xl"
          onClose={() => setEditing(null)}
          footer={
            <button onClick={() => setEditing(null)} className="btn-primary">Listo</button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">Nombre</label>
              <input
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                onBlur={() => patch(editing.id, { name: editing.name })}
                className="input-light text-sm font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">Descripción</label>
              <input
                value={editing.description || ''}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                onBlur={() => patch(editing.id, { description: editing.description || '' })}
                className="input-light text-sm"
                placeholder="Breve descripción para el equipo"
              />
            </div>
          </div>
          <DebouncedTemplateBodyEditor
            template={editing}
            onLocalUpdate={(nextBody) => setEditing(prev => ({ ...prev, body: nextBody }))}
            onPersist={async (nextBody) => {
              try {
                await updateQuestionnaireTemplate(editing.id, { body: nextBody });
                setItems(prev => prev.map(i => i.id === editing.id ? { ...i, body: nextBody } : i));
              } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// Debounce 800ms el guardado del body de una plantilla. Sin esto, cada
// tecleo del editor rich-text dispara una PATCH al server (audit C1).
function DebouncedTemplateBodyEditor({ template, onLocalUpdate, onPersist }) {
  const timer = useRef(null);
  const pendingRef = useRef(null);
  // Flush al desmontar/cambiar de plantilla.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pendingRef.current !== null) {
      const body = pendingRef.current;
      pendingRef.current = null;
      onPersist(body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  return (
    <QuestionnaireEditor
      value={template.body || { sections: [] }}
      onChange={(nextBody) => {
        onLocalUpdate(nextBody);
        pendingRef.current = nextBody;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const body = pendingRef.current;
          pendingRef.current = null;
          onPersist(body);
        }, 800);
      }}
    />
  );
}
