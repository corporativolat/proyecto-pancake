import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

// Lista corta de países (foco LatAm + globales). El cliente puede escribir
// otro vía la opción "Otro" → input libre.
const COUNTRIES = [
  'Colombia', 'México', 'Argentina', 'Brasil', 'Chile', 'Perú', 'Ecuador',
  'Venezuela', 'Uruguay', 'Paraguay', 'Bolivia', 'Costa Rica', 'Panamá',
  'República Dominicana', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua',
  'Cuba', 'Puerto Rico', 'España', 'Estados Unidos', 'Canadá', 'Otro'
];

const ID_TYPES = [
  { v: 'CC',   l: 'Cédula de ciudadanía (CC)' },
  { v: 'NIT',  l: 'NIT (empresas)' },
  { v: 'CE',   l: 'Cédula de extranjería (CE)' },
  { v: 'PP',   l: 'Pasaporte' },
  { v: 'OTRO', l: 'Otro' }
];

// Modal fullscreen no descartable que recolecta datos obligatorios del
// cliente la primera vez que entra al portal. Se monta en PortalLayout y
// solo aparece si profile.role === 'cliente' && !profile.client_data_completed.
export default function ClientDataGate() {
  const { profile, isClient, refresh } = useAuth();
  const showToast = useToast(s => s.show);
  const [whatsapp, setWhatsapp]       = useState(profile?.whatsapp || profile?.phone || '');
  const [country, setCountry]         = useState(profile?.country || 'Colombia');
  const [countryOther, setCountryOther] = useState('');
  const [idType, setIdType]           = useState(profile?.id_type || 'CC');
  const [idNumber, setIdNumber]       = useState(profile?.id_number || '');
  const [contactEmail, setContactEmail] = useState(profile?.contact_email || profile?.email || '');
  const [busy, setBusy]               = useState(false);

  if (!profile || !isClient) return null;
  if (profile.client_data_completed) return null;

  const finalCountry = country === 'Otro' ? countryOther.trim() : country;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
  const valid =
    whatsapp.trim().length >= 7 &&
    finalCountry.length >= 2 &&
    idNumber.trim().length >= 4 &&
    emailOk;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({
        whatsapp: whatsapp.trim(),
        phone: whatsapp.trim(),
        country: finalCountry,
        id_type: idType,
        id_number: idNumber.trim(),
        contact_email: contactEmail.trim(),
        client_data_completed: true
      }).eq('id', profile.id);
      if (error) throw error;
      await refresh();
      showToast('Datos guardados, ¡bienvenido!', 'success');
    } catch (e) {
      showToast('No pudimos guardar: ' + (e.message || 'error desconocido'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-ink-900/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 md:p-8 my-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-lg md:text-xl tracking-tight">Antes de continuar</h2>
            <p className="text-[12px] text-ink-500">Necesitamos algunos datos básicos para poder atender tu proyecto.</p>
          </div>
        </div>

        <p className="text-[11px] text-ink-500 leading-relaxed bg-ink-50 border border-ink-100 rounded-xl p-3 mb-5">
          Estos datos son <strong className="text-ink-800">obligatorios</strong>. Solo los compartimos con tu equipo asignado y los usamos para facturación, contacto y entregas.
        </p>

        <div className="space-y-4">
          <Field label="Contacto de WhatsApp *">
            <input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="Ej. +57 300 123 4567"
              className="input-light"
              inputMode="tel"
              autoComplete="tel"
              required />
            <Hint>Incluye el código de país. Te escribiremos por ahí para coordinar.</Hint>
          </Field>

          <Field label="País *">
            <select value={country} onChange={e => setCountry(e.target.value)} className="input-light" required>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {country === 'Otro' && (
              <input
                value={countryOther}
                onChange={e => setCountryOther(e.target.value)}
                placeholder="Escribe tu país"
                className="input-light mt-2"
                required />
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tipo de ID *" className="col-span-1">
              <select value={idType} onChange={e => setIdType(e.target.value)} className="input-light" required>
                {ID_TYPES.map(t => <option key={t.v} value={t.v}>{t.v}</option>)}
              </select>
            </Field>
            <Field label="Número de identificación *" className="col-span-2">
              <input
                value={idNumber}
                onChange={e => setIdNumber(e.target.value)}
                placeholder="Ej. 1020304050 / 900.123.456-7"
                className="input-light"
                required />
            </Field>
          </div>
          <Hint>NIT si eres empresa, CC si eres persona natural en Colombia. Si es de otro país, escoge el tipo que aplique.</Hint>

          <Field label="Correo electrónico de contacto *">
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="tu-correo@dominio.com"
              className="input-light"
              autoComplete="email"
              required />
            <Hint>
              Iniciaste sesión con <strong>{profile.email}</strong>. Si tu correo personal es distinto, escríbelo aquí. Las notificaciones igual te llegan al de login.
            </Hint>
          </Field>
        </div>

        <button
          type="submit"
          disabled={!valid || busy}
          className="btn-emerald w-full mt-6 justify-center disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : 'Guardar y continuar'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }) {
  return <p className="text-[10px] text-ink-400 mt-1.5 leading-relaxed">{children}</p>;
}
