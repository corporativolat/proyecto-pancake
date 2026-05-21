import { useState } from 'react';
import { Mail, MessageCircle, Send, AlertCircle, Copy, Check } from 'lucide-react';
import Modal from './Modal.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { useT } from '../lib/i18n.jsx';
import { createInvitation, sendInvitation, cancelInvitation, friendlyDbError } from '../lib/data';

// Modal de invitación a un equipo. Dos canales:
//   - Email: funcional vía edge function `invite-user` (Gmail SMTP, ver
//     supabase/functions/invite-user/index.ts).
//   - WhatsApp: queda en STUB hasta que la API de Pancake esté disponible.
//     La invitación se crea como `pendiente`; el edge function devuelve
//     `pending_api` y mostramos el link manual para que el líder lo copie
//     y lo envíe a mano.
export default function InviteModal({ team, onClose, onSent }) {
  const { profile } = useAuth();
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [channel, setChannel] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('miembro');
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    if (channel === 'email') {
      const v = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        showToast('Email inválido', 'error'); return;
      }
    } else {
      if (!phone.trim()) { showToast('Teléfono requerido', 'error'); return; }
    }
    setSending(true);
    let createdId = null;
    try {
      const payload = {
        team_id: team.id,
        channel,
        role,
        invited_by: profile.id,
        email: channel === 'email' ? email.trim() : null,
        phone: channel === 'whatsapp' ? phone.trim() : null
      };
      const inv = await createInvitation(payload);
      createdId = inv.id;
      let res;
      try {
        res = await sendInvitation(inv.id);
      } catch (sendErr) {
        // El INSERT funcionó pero el edge function falló: cancelamos la
        // fila para que el líder pueda re-intentar sin acumular duplicados.
        try { await cancelInvitation(createdId); } catch { /* best-effort */ }
        throw sendErr;
      }

      // El edge function devuelve { ok, link, channel_status }.
      const link = res?.link || buildFallbackLink(inv.token);
      setLastLink(link);

      if (res?.channel_status === 'pending_api') {
        showToast('Invitación creada — copia el link y compártelo (WhatsApp API pendiente)', 'info');
      } else if (res?.channel_status === 'in_app') {
        showToast('Le llegó la invitación directo a su bandeja de notificaciones', 'success');
      } else {
        showToast('Invitación enviada');
      }
      onSent?.();
    } catch (e) {
      const fe = friendlyDbError(e);
      const friendly = (fe.key && t(fe.key)) || fe.raw || e?.message || 'No se pudo enviar la invitación';
      showToast('Error: ' + friendly, 'error');
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  return (
    <Modal title={`Invitar a ${team.name}`} onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cerrar</button>
          <button onClick={handleSend} disabled={sending} className="btn-primary">
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-2">Canal</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`p-3 rounded-xl border-2 transition flex items-center gap-2 ${channel === 'email' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'}`}
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm font-bold">Email</span>
            </button>
            <button
              type="button"
              onClick={() => setChannel('whatsapp')}
              className={`p-3 rounded-xl border-2 transition flex items-center gap-2 ${channel === 'whatsapp' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'}`}
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm font-bold">WhatsApp</span>
            </button>
          </div>
          {channel === 'whatsapp' && (
            <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>API de Pancake pendiente. La invitación se guarda y te damos el link para que lo envíes manualmente por ahora.</span>
            </div>
          )}
        </div>

        {channel === 'email' ? (
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-2">Email destinatario</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nombre@dominio.com"
              className="input-light"
              autoFocus
            />
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-2">Teléfono (con código país)</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+57 300 000 0000"
              className="input-light"
              autoFocus
            />
          </div>
        )}

        <div>
          <label className="text-[10px] font-black text-ink-500 uppercase tracking-widest block mb-2">Rol al unirse</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('miembro')}
              className={`p-3 rounded-xl border-2 transition text-left ${role === 'miembro' ? 'border-violet-500 bg-violet-50' : 'border-ink-200 hover:border-ink-300'}`}
            >
              <div className="text-sm font-black text-ink-900">Miembro</div>
              <div className="text-[10px] text-ink-500 mt-0.5">Trabaja dentro del equipo.</div>
            </button>
            <button
              type="button"
              onClick={() => setRole('lider_equipo')}
              className={`p-3 rounded-xl border-2 transition text-left ${role === 'lider_equipo' ? 'border-amber-500 bg-amber-50' : 'border-ink-200 hover:border-ink-300'}`}
              disabled={!!team.leader_id}
            >
              <div className="text-sm font-black text-ink-900">Líder del equipo</div>
              <div className="text-[10px] text-ink-500 mt-0.5">{team.leader_id ? 'Ya hay un líder asignado.' : 'Gestiona el equipo y sus proyectos.'}</div>
            </button>
          </div>
        </div>

        {lastLink && (
          <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-3">
            <div className="text-[10px] font-black text-ink-500 uppercase tracking-widest mb-1.5">Link de invitación</div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={lastLink}
                className="flex-1 input-light !py-1.5 !text-xs font-mono"
                onFocus={e => e.target.select()}
              />
              <button onClick={copyLink} className="btn-ghost-sm" title="Copiar link">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-ink-500 mt-2">Válido por 14 días. Quien lo abra y se registre quedará asignado al equipo automáticamente.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function buildFallbackLink(token) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?invite=${token}`;
}
