import { useState } from 'react';
import { Users2, Check, X, Crown, Briefcase } from 'lucide-react';
import { useToast } from '../lib/toast';
import { acceptInvitation, declineInvitation, friendlyDbError } from '../lib/data';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';

// Modal que se abre cuando el usuario clickea una notificación con
// kind='team_invitation'. Muestra el equipo y permite Aceptar o Rechazar.
// El token viaja dentro de `notif.meta.token` (mig-30).
export default function AcceptInviteModal({ notification, onClose, onDone }) {
  const showToast = useToast(s => s.show);
  const teams = useStore(s => s.teams);
  const refreshTeams = useStore(s => s.refreshTeams);
  const refreshProfiles = useStore(s => s.refreshProfiles);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { refresh: refreshAuthProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  const meta = notification?.meta || {};
  const token = meta.token;
  const teamName = meta.team_name || 'el equipo';
  const role = meta.role || 'miembro';
  const roleLabel = role === 'lider_equipo' ? 'Líder del equipo' : 'Miembro';
  const team = teams.find(tm => tm.id === meta.team_id);

  const handleAccept = async () => {
    if (!token) { showToast('Invitación sin token válido', 'error'); return; }
    setBusy(true);
    try {
      await acceptInvitation(token);
      // Tras aceptar: triggers servidor mutaron profiles.team_id y
      // posiblemente role. Refrescamos en este orden para que la UI
      // recoja el nuevo rol antes de navegar:
      //   - useAuth().refresh: el profile local (decide capabilities).
      //   - refreshTeams/profiles/projects: store global.
      await Promise.allSettled([
        refreshAuthProfile?.(),
        refreshTeams(),
        refreshProfiles(),
        refreshProjects()
      ]);
      showToast(`¡Bienvenido a ${teamName}!`);
      onDone?.({ status: 'aceptada' });
      onClose();
    } catch (e) {
      const fe = friendlyDbError(e);
      showToast('Error: ' + (fe.raw || e.message || 'No se pudo aceptar'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!token) { showToast('Invitación sin token válido', 'error'); return; }
    setBusy(true);
    try {
      await declineInvitation(token);
      showToast('Invitación rechazada');
      onDone?.({ status: 'cancelada' });
      onClose();
    } catch (e) {
      const fe = friendlyDbError(e);
      showToast('Error: ' + (fe.raw || e.message || 'No se pudo rechazar'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-card max-w-md">
        <div className="modal-header" style={team?.color ? { background: `linear-gradient(135deg, ${team.color}, ${team.color}cc)` } : undefined}>
          <h3 className="text-lg font-black tracking-tight">Invitación a equipo</h3>
          <button onClick={onClose} disabled={busy} className="text-white/70 hover:text-white disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="modal-body scroller-pro">
          <div className="flex flex-col items-center text-center py-3">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4" style={{ background: (team?.color || '#7c3aed') + '22', color: team?.color || '#7c3aed' }}>
              <Users2 className="w-10 h-10" />
            </div>
            <h4 className="text-2xl font-black text-ink-900 mb-1">{teamName}</h4>
            <p className="text-sm text-ink-500">Te invitan a unirte como</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-full">
              {role === 'lider_equipo' ? <Crown className="w-3.5 h-3.5 text-violet-700" /> : <Briefcase className="w-3.5 h-3.5 text-violet-700" />}
              <span className="text-xs font-black text-violet-700 uppercase tracking-widest">{roleLabel}</span>
            </div>
            <p className="text-xs text-ink-500 mt-5 leading-relaxed max-w-xs">
              Al aceptar te asignamos al equipo {role === 'lider_equipo' ? 'y te promovemos a líder' : ''}. Vas a poder ver todos los proyectos del equipo en tu panel.
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={handleDecline} disabled={busy} className="btn-ghost text-red-600 hover:text-red-700">
            <X className="w-3.5 h-3.5" /> Rechazar
          </button>
          <button onClick={handleAccept} disabled={busy} className="btn-primary">
            <Check className="w-3.5 h-3.5" /> {busy ? 'Procesando…' : 'Aceptar invitación'}
          </button>
        </div>
      </div>
    </div>
  );
}
