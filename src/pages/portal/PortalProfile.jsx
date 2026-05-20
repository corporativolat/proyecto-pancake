import { useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';

// Perfil del cliente: edita nombre, teléfono, empresa.
// Cambio de contraseña vía supabase.auth.updateUser.
export default function PortalProfile() {
  const { profile, refresh } = useAuth();
  const showToast = useToast(s => s.show);
  const [name, setName]                 = useState(profile?.name || '');
  const [phone, setPhone]               = useState(profile?.phone || '');
  const [company, setCompany]           = useState(profile?.company || '');
  const [whatsapp, setWhatsapp]         = useState(profile?.whatsapp || '');
  const [country, setCountry]           = useState(profile?.country || '');
  const [idType, setIdType]             = useState(profile?.id_type || 'CC');
  const [idNumber, setIdNumber]         = useState(profile?.id_number || '');
  const [contactEmail, setContactEmail] = useState(profile?.contact_email || '');
  const [pwd, setPwd]         = useState('');
  const [pwd2, setPwd2]       = useState('');
  const [busy, setBusy]       = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({
        name, phone, company,
        whatsapp, country, id_type: idType, id_number: idNumber, contact_email: contactEmail
      }).eq('id', profile.id);
      if (error) throw error;
      await refresh();
      showToast('Perfil actualizado', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pwd.length < 8) return showToast('Mínimo 8 caracteres', 'error');
    if (pwd !== pwd2) return showToast('Las contraseñas no coinciden', 'error');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd(''); setPwd2('');
      showToast('Contraseña actualizada', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const score = (() => {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  })();
  const scoreLabels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Mi perfil</h1>
        <p className="text-sm text-ink-500 mt-1">Datos personales y acceso.</p>
      </header>

      <form onSubmit={saveProfile} className="bg-white border rounded-2xl p-6 space-y-4 mb-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-2">Datos</h2>
        <Field label="Nombre"><input value={name} onChange={e => setName(e.target.value)} className="input-light" required /></Field>
        <Field label="Email de login"><input value={profile?.email || ''} disabled className="input-light bg-ink-50 cursor-not-allowed" /></Field>
        <Field label="Email de contacto"><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="input-light" /></Field>
        <Field label="WhatsApp"><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="input-light" inputMode="tel" placeholder="+57 300 123 4567" /></Field>
        <Field label="Teléfono"><input value={phone} onChange={e => setPhone(e.target.value)} className="input-light" /></Field>
        <Field label="País"><input value={country} onChange={e => setCountry(e.target.value)} className="input-light" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo ID">
            <select value={idType} onChange={e => setIdType(e.target.value)} className="input-light">
              <option value="CC">CC</option>
              <option value="NIT">NIT</option>
              <option value="CE">CE</option>
              <option value="PP">PP</option>
              <option value="OTRO">OTRO</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Número de identificación">
              <input value={idNumber} onChange={e => setIdNumber(e.target.value)} className="input-light" />
            </Field>
          </div>
        </div>
        <Field label="Empresa"><input value={company} onChange={e => setCompany(e.target.value)} className="input-light" /></Field>
        <button type="submit" disabled={busy} className="btn-emerald">Guardar cambios</button>
      </form>

      <form onSubmit={savePassword} className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-2">Cambiar contraseña</h2>
        <Field label="Nueva contraseña">
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} className="input-light" minLength={8} required />
        </Field>
        {pwd && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${score < 2 ? 'bg-red-500' : score < 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: (score / 4) * 100 + '%' }} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{scoreLabels[score]}</span>
          </div>
        )}
        <Field label="Confirmar contraseña">
          <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} className="input-light" minLength={8} required />
        </Field>
        <button type="submit" disabled={busy || !pwd} className="btn-emerald disabled:opacity-50">Actualizar contraseña</button>
      </form>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
