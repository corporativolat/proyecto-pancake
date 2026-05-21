import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users2, Plus, UserPlus, X, Trash2, Pencil, Crown, Briefcase, FolderKanban } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { staggerIn, reduced } from '../lib/motion';
import { supabase } from '../lib/supabase';
import {
  createTeam, updateTeam, deleteTeam, setProfileTeam, updateProfile,
  fetchInvitations, cancelInvitation, sendInvitation,
  friendlyDbError
} from '../lib/data';
import Avatar from '../components/Avatar.jsx';
import InviteModal from '../components/InviteModal.jsx';

// Mapea un error de DB a un mensaje amigable usando i18n + fallback al raw.
function dbErrorMessage(e, t) {
  const fe = friendlyDbError(e);
  return (fe.key && t(fe.key)) || fe.raw || e?.message || 'Error';
}

const TEAM_COLORS = ['#7c3aed','#10b981','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#3b82f6'];

export default function Teams() {
  const { profile, can } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const showToast = useToast(s => s.show);
  const ref = useRef(null);

  const teams = useStore(s => s.teams);
  const profiles = useStore(s => s.profiles);
  const projects = useStore(s => s.projects);
  const refreshTeams = useStore(s => s.refreshTeams);
  const refreshProfiles = useStore(s => s.refreshProfiles);

  const [editingTeam, setEditingTeam] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [creating, setCreating] = useState(false);

  // Filtro: si es lider_equipos, solo sus equipos. Si es lider_equipo,
  // solo el equipo del que es líder.
  const visibleTeams = useMemo(() => {
    if (!profile) return [];
    if (can('viewAll')) return teams;
    return teams.filter(tm => tm.manager_id === profile.id || tm.leader_id === profile.id);
  }, [teams, profile, can]);

  useEffect(() => {
    if (reduced || !ref.current) return;
    staggerIn(ref.current);
  }, [visibleTeams.length]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const color = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];
      const payload = { name: 'Nuevo equipo', color };
      // Si soy lider_equipos, quedo como manager. Si soy admin/gerente, no.
      if (profile?.role === 'lider_equipos') payload.manager_id = profile.id;
      await createTeam(payload);
      await refreshTeams();
      showToast('Equipo creado');
    } catch (e) {
      showToast('Error creando equipo: ' + dbErrorMessage(e, t), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (team) => {
    const ok = await askConfirm({
      title: 'Eliminar equipo',
      message: `¿Eliminar "${team.name}"? Los proyectos asociados quedarán sin equipo, los miembros sin team_id.`,
      danger: true
    });
    if (!ok) return;
    try {
      await deleteTeam(team.id);
      await Promise.all([refreshTeams(), refreshProfiles()]);
      showToast('Equipo eliminado');
    } catch (e) { showToast('Error: ' + dbErrorMessage(e, t), 'error'); }
  };

  // Realtime: cualquier cambio en invitations refresca todas las listas de
  // invitaciones; reusamos el canal del nivel App.jsx para teams/profiles.
  // Aquí emitimos un bus interno para que las InvitationsList re-carguen.
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`teams-invs-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'invitations' }, () => {
        window.dispatchEvent(new CustomEvent('pg:invitations-changed'));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  if (!can('manageTeams') && !can('manageOwnTeam')) {
    return (
      <section className="flex-1 p-10">
        <p className="text-ink-500">No tienes permiso para ver equipos.</p>
      </section>
    );
  }

  return (
    <section ref={ref} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 md:mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-3">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">Equipos</p>
            <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">Gestión de equipos</h2>
            <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">
              Crea equipos, asigna líderes e invita miembros por email o WhatsApp.
            </p>
          </div>
          {can('manageTeams') && (
            <button onClick={handleCreate} disabled={creating} className="btn-primary self-start md:self-auto">
              <Plus className="w-3.5 h-3.5" /> Nuevo equipo
            </button>
          )}
        </header>

        {visibleTeams.length === 0 ? (
          <div className="card-light p-10 text-center">
            <Users2 className="w-10 h-10 mx-auto text-ink-300 mb-3" />
            <h3 className="text-lg font-black text-ink-700 mb-1">Todavía no hay equipos</h3>
            <p className="text-sm text-ink-500 max-w-md mx-auto">
              {can('manageTeams')
                ? 'Crea el primer equipo y asígnale un líder. Después podrás invitar miembros.'
                : 'Pídele a tu administrador que te asigne un equipo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleTeams.map(team => (
              <TeamCard
                key={team.id}
                team={team}
                profiles={profiles}
                projects={projects}
                profile={profile}
                can={can}
                onEdit={() => setEditingTeam(team)}
                onInvite={() => setInviting(team)}
                onDelete={() => handleDelete(team)}
                onRefresh={() => Promise.all([refreshTeams(), refreshProfiles()])}
                onNavigateProject={(id) => navigate(`/projects/${id}`)}
              />
            ))}
          </div>
        )}

        {inviting && (
          <InviteModal
            team={inviting}
            onClose={() => setInviting(null)}
            onSent={async () => {
              // refresh por si llegó alguien por aceptar (caso usuario existente)
              await refreshProfiles();
            }}
          />
        )}

        {editingTeam && (
          <EditTeamModal
            team={editingTeam}
            profiles={profiles}
            onClose={() => setEditingTeam(null)}
            onSaved={async () => {
              await refreshTeams();
              setEditingTeam(null);
            }}
          />
        )}
      </div>
    </section>
  );
}

function TeamCard({ team, profiles, projects, profile, can, onEdit, onInvite, onDelete, onRefresh, onNavigateProject }) {
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const manager = useMemo(() => profiles.find(p => p.id === team.manager_id), [profiles, team.manager_id]);
  const leader = useMemo(() => profiles.find(p => p.id === team.leader_id), [profiles, team.leader_id]);
  const members = useMemo(() => profiles.filter(p => p.team_id === team.id), [profiles, team.id]);
  const teamProjects = useMemo(() => projects.filter(p => p.team_id === team.id), [projects, team.id]);

  const canManage = can('manageTeams') || team.manager_id === profile?.id;
  const canManageOwn = canManage || team.leader_id === profile?.id;
  // Sacar miembros: solo admin/manager o líder del propio equipo (mig-31
  // añade RLS para lider_equipo). Nunca para otros roles.
  const canRemoveMembers = canManage || team.leader_id === profile?.id;

  const removeMember = async (memberId) => {
    try {
      await setProfileTeam(memberId, null);
      await onRefresh();
    } catch (e) {
      showToast('Error sacando miembro: ' + dbErrorMessage(e, t), 'error');
    }
  };

  return (
    <div className="card-light p-5" data-stagger>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: team.color + '22', color: team.color }}>
          <Users2 className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-ink-900 truncate">{team.name}</h3>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
            {members.length} miembros · {teamProjects.length} proyectos
          </p>
        </div>
        {canManage && (
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 transition" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {canManage && (
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <RoleRow icon={<Briefcase className="w-3.5 h-3.5" />} label="Manager" user={manager} fallback="Sin asignar" />
        <RoleRow icon={<Crown className="w-3.5 h-3.5" />} label="Líder" user={leader} fallback="Sin líder asignado" />
      </div>

      {members.length > 0 && (
        <div className="border-t border-ink-100 pt-3 mb-3">
          <div className="text-[10px] font-black text-ink-500 uppercase tracking-widest mb-2">Miembros</div>
          <div className="space-y-1.5">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2 group">
                <Avatar user={m} size={24} />
                <div className="flex-1 text-xs font-bold text-ink-700 truncate">{m.name}</div>
                <span className="text-[9px] text-ink-400 uppercase font-bold tracking-wider">{m.role}</span>
                {canRemoveMembers && m.role !== 'lider_equipo' && m.id !== profile?.id && (
                  <button
                    onClick={() => removeMember(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition p-0.5 text-ink-400 hover:text-red-500"
                    title="Sacar del equipo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {teamProjects.length > 0 && (
        <div className="border-t border-ink-100 pt-3 mb-3">
          <div className="text-[10px] font-black text-ink-500 uppercase tracking-widest mb-2">Proyectos</div>
          <div className="space-y-1">
            {teamProjects.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => onNavigateProject(p.id)}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-ink-50 transition"
              >
                <FolderKanban className="w-3 h-3 text-ink-400" />
                <span className="text-xs font-bold text-ink-700 truncate flex-1">{p.title}</span>
                <span className="text-[9px] text-ink-400">{p.status}</span>
              </button>
            ))}
            {teamProjects.length > 5 && (
              <p className="text-[10px] text-ink-400 px-2">+{teamProjects.length - 5} más</p>
            )}
          </div>
        </div>
      )}

      {canManageOwn && (
        <button onClick={onInvite} className="btn-soft w-full justify-center mt-2">
          <UserPlus className="w-3.5 h-3.5" /> Invitar al equipo
        </button>
      )}

      <InvitationsList teamId={team.id} canManage={canManageOwn} />
    </div>
  );
}

function RoleRow({ icon, label, user, fallback }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-6 h-6 rounded-lg bg-ink-100 flex items-center justify-center text-ink-500">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black text-ink-400 uppercase tracking-widest">{label}</div>
        <div className="font-bold text-ink-800 truncate">{user?.name || <span className="text-ink-400 italic font-normal">{fallback}</span>}</div>
      </div>
    </div>
  );
}

function InvitationsList({ teamId, canManage }) {
  const { t } = useT();
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const showToast = useToast(s => s.show);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchInvitations(teamId);
        if (!cancelled) setInvs(data);
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    // Bus interno: el listener del padre Teams() dispara este evento al
    // recibir cambios en invitations vía realtime.
    const onChanged = () => load();
    window.addEventListener('pg:invitations-changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('pg:invitations-changed', onChanged);
    };
  }, [teamId]);

  const pendings = invs.filter(i => i.status === 'pendiente' || i.status === 'enviada');
  if (loading || pendings.length === 0) return null;

  const cancel = async (id) => {
    try { await cancelInvitation(id); showToast('Invitación cancelada'); }
    catch (e) { showToast('Error: ' + dbErrorMessage(e, t), 'error'); }
  };
  const resend = async (id) => {
    try { await sendInvitation(id); showToast('Reenviada'); }
    catch (e) { showToast('Error: ' + dbErrorMessage(e, t), 'error'); }
  };

  return (
    <div className="border-t border-ink-100 pt-3 mt-3">
      <div className="text-[10px] font-black text-ink-500 uppercase tracking-widest mb-2">Invitaciones pendientes</div>
      <div className="space-y-1.5">
        {pendings.map(inv => (
          <div key={inv.id} className="flex items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${inv.channel === 'email' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {inv.channel}
            </span>
            <span className="flex-1 truncate text-ink-700">{inv.email || inv.phone}</span>
            <span className="text-[9px] text-ink-400 uppercase font-bold">{inv.role}</span>
            {canManage && (
              <>
                <button onClick={() => resend(inv.id)} className="text-[10px] font-bold text-violet-600 hover:underline">Reenviar</button>
                <button onClick={() => cancel(inv.id)} className="text-[10px] font-bold text-red-500 hover:underline">Cancelar</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditTeamModal({ team, profiles, onClose, onSaved }) {
  const { t } = useT();
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [managerId, setManagerId] = useState(team.manager_id || '');
  const [leaderId, setLeaderId] = useState(team.leader_id || '');
  const [saving, setSaving] = useState(false);
  const showToast = useToast(s => s.show);

  // Candidatos a líder: cualquier miembro (lo promovemos al guardar) o
  // alguien que ya sea lider_equipo (con UNIQUE constraint, solo si no
  // tiene otro equipo).
  const leaderCandidates = useMemo(
    () => profiles.filter(p => ['miembro', 'lider_equipo'].includes(p.role)),
    [profiles]
  );
  const managerCandidates = useMemo(
    () => profiles.filter(p => ['lider_equipos', 'admin', 'super_admin', 'gerente'].includes(p.role)),
    [profiles]
  );

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        name: name.trim() || 'Equipo sin nombre',
        color,
        manager_id: managerId || null,
        leader_id: leaderId || null
      };
      await updateTeam(team.id, patch);

      // Si se asignó líder nuevo y aún era miembro, promovemos su role
      // a lider_equipo en una llamada SEPARADA (evita que si la
      // promoción falla por RLS, la actualización del team se revierta).
      if (leaderId && leaderId !== team.leader_id) {
        const cand = profiles.find(p => p.id === leaderId);
        if (cand && cand.role === 'miembro') {
          try {
            await updateProfile(leaderId, { role: 'lider_equipo', team_id: team.id });
          } catch (promoErr) {
            // RLS bloquea la promoción si el actor no es admin.
            // Avisamos al usuario que el rol no cambió pero el resto sí.
            showToast(
              'Equipo guardado, pero el rol del líder no cambió (solo admin puede promover). Pídele al admin que lo ascienda.',
              'info'
            );
            await onSaved();
            return;
          }
        }
      }
      await onSaved();
    } catch (e) {
      showToast('Error: ' + dbErrorMessage(e, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card max-w-lg">
        <div className="modal-header">
          <h3 className="text-lg font-black tracking-tight">Editar equipo</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="modal-body scroller-pro space-y-4">
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-1.5">Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-light" />
          </div>
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={`w-7 h-7 rounded-lg border-2 ${color === c ? 'border-ink-900 dark:border-white' : 'border-transparent'}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-1.5">Manager (líder de equipos)</label>
            <select value={managerId} onChange={e => setManagerId(e.target.value)} className="input-light">
              <option value="">— sin manager —</option>
              {managerCandidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-1.5">Líder del equipo</label>
            <select value={leaderId} onChange={e => setLeaderId(e.target.value)} className="input-light">
              <option value="">— sin líder —</option>
              {leaderCandidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
            <p className="text-[10px] text-ink-500 mt-1">Si elegís un miembro, se promueve a &ldquo;lider_equipo&rdquo;. Solo admin puede cambiar roles.</p>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
