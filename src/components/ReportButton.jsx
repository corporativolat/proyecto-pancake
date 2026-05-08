import { useState } from 'react';
import { Bug, Send } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { createErrorReport } from '../lib/reports';
import Modal from './Modal.jsx';

const SEVERITIES = [
  { value: 'low', label: '🟢 Baja' },
  { value: 'normal', label: '⚪ Normal' },
  { value: 'high', label: '🟠 Alta' },
  { value: 'urgent', label: '🔴 Urgente' },
];

export default function ReportButton() {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  const reset = () => { setTitle(''); setDescription(''); setSeverity('normal'); };
  const close = () => { setOpen(false); reset(); };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      showToast('Título y descripción son obligatorios', 'error');
      return;
    }
    if (title.length > 200) { showToast('Título demasiado largo (máx 200)', 'error'); return; }
    if (description.length > 4000) { showToast('Descripción demasiado larga (máx 4000)', 'error'); return; }
    setBusy(true);
    try {
      await createErrorReport({ profileId: profile.id, title, description, severity });
      showToast('✓ Reporte enviado. Gracias.');
      close();
    } catch (e) {
      showToast('Error al enviar: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Reportar un error"
        aria-label="Reportar un error"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 hover:scale-110 active:scale-95 transition"
      >
        <Bug className="w-5 h-5" />
      </button>

      {open && (
        <Modal
          title="Reportar un error"
          onClose={close}
          footer={(
            <>
              <button onClick={close} className="btn-ghost" disabled={busy}>Cancelar</button>
              <button onClick={submit} className="btn-primary" disabled={busy}>
                <Send className="w-3.5 h-3.5" /> {busy ? 'ENVIANDO…' : 'ENVIAR'}
              </button>
            </>
          )}
        >
          <Field label="Título corto">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ej: el botón Guardar no responde en la página de proyecto"
              className="input-light"
            />
          </Field>

          <Field label="Descripción detallada">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={4000}
              rows={6}
              placeholder="Pasos para reproducir, qué esperabas, qué pasó."
              className="input-light resize-none"
            />
            <p className="text-[10px] text-ink-400 mt-1">{description.length}/4000</p>
          </Field>

          <Field label="Severidad">
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="input-light">
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-[11px] text-ink-600 leading-relaxed">
            <strong className="text-violet-700">Adjuntamos automáticamente:</strong> URL actual, tu identificador de usuario y user-agent del navegador. No se envía nada más.
          </div>
        </Modal>
      )}
    </>
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
