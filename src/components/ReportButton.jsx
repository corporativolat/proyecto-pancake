import { useState } from 'react';
import { Bug, Send } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { useT } from '../lib/i18n.jsx';
import { createErrorReport } from '../lib/reports';
import Modal from './Modal.jsx';

export default function ReportButton() {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  const SEVERITIES = [
    { value: 'low', label: t('reportBtn.sev.low') },
    { value: 'normal', label: t('reportBtn.sev.normal') },
    { value: 'high', label: t('reportBtn.sev.high') },
    { value: 'urgent', label: t('reportBtn.sev.urgent') },
  ];

  const reset = () => { setTitle(''); setDescription(''); setSeverity('normal'); };
  const close = () => { setOpen(false); reset(); };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      showToast(t('reportBtn.required'), 'error');
      return;
    }
    if (title.length > 200) { showToast(t('reportBtn.titleTooLong'), 'error'); return; }
    if (description.length > 4000) { showToast(t('reportBtn.descTooLong'), 'error'); return; }
    setBusy(true);
    try {
      await createErrorReport({ profileId: profile.id, title, description, severity });
      showToast(t('reportBtn.sent'));
      close();
    } catch (e) {
      showToast(t('reportBtn.errorSend') + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('reportBtn.title')}
        aria-label={t('reportBtn.title')}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 hover:scale-110 active:scale-95 transition"
      >
        <Bug className="w-5 h-5" />
      </button>

      {open && (
        <Modal
          title={t('reportBtn.title')}
          onClose={close}
          footer={(
            <>
              <button onClick={close} className="btn-ghost" disabled={busy}>{t('common.cancel')}</button>
              <button onClick={submit} className="btn-primary" disabled={busy}>
                <Send className="w-3.5 h-3.5" /> {busy ? t('reportBtn.sending') : t('reportBtn.send')}
              </button>
            </>
          )}
        >
          <Field label={t('reportBtn.field.title')}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              placeholder={t('reportBtn.placeholder.title')}
              className="input-light"
            />
          </Field>

          <Field label={t('reportBtn.field.desc')}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={4000}
              rows={6}
              placeholder={t('reportBtn.placeholder.desc')}
              className="input-light resize-none"
            />
            <p className="text-[10px] text-ink-400 mt-1">{description.length}/4000</p>
          </Field>

          <Field label={t('reportBtn.field.severity')}>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="input-light">
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-[11px] text-ink-600 leading-relaxed">
            <strong className="text-violet-700">{t('reportBtn.attachNote.label')}</strong>{t('reportBtn.attachNote.body')}
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
