import { useState, useRef, useEffect } from 'react';
import { User, Globe, Lock, Camera, Trash2, Save, Home, Bell } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { updateProfile } from '../lib/data';
import { supabase } from '../lib/supabase';
import { uploadAvatar, removeAvatar } from '../lib/storage';
import { staggerIn, reduced } from '../lib/motion';
import Avatar from '../components/Avatar.jsx';
import { avatarClass } from '../lib/utils';

export default function Settings() {
  const { profile, refresh } = useAuth();
  const { t, lang, change: changeLang } = useT();
  const refreshProfiles = useStore(s => s.refreshProfiles);
  const showToast = useToast(s => s.show);
  const [name, setName] = useState(profile?.name || '');
  const [avatar, setAvatar] = useState(profile?.avatar || 1);
  const [landingRoute, setLandingRoute] = useState(profile?.landing_route || '/dashboard');
  const [notifEmail, setNotifEmail] = useState(profile?.notif_email_enabled ?? true);
  const [notifInapp, setNotifInapp] = useState(profile?.notif_inapp_enabled ?? true);
  const [notifChannel, setNotifChannel] = useState(profile?.notif_channel || 'email');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    if (!reduced && sectionRef.current) staggerIn(sectionRef.current);
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile(profile.id, { name, avatar });
      await refresh();
      await refreshProfiles();
      showToast(t('settings.toast.saved'));
    } catch (e) { showToast(t('common.error') + ': ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  // Guarda landing + flags de notificación. Debounced indirectamente vía botón.
  const savePrefs = async (patch) => {
    try {
      await updateProfile(profile.id, patch);
      await refresh();
      await refreshProfiles();
      showToast(t('settings.toast.saved'));
    } catch (e) { showToast(t('common.error') + ': ' + e.message, 'error'); }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast(t('settings.fileNotImage'), 'error'); return; }
    if (file.size > 4 * 1024 * 1024) { showToast(t('settings.fileTooBig'), 'error'); return; }
    setBusy(true);
    try {
      if (profile.avatar_url) { await removeAvatar(profile.avatar_url).catch(() => {}); }
      const url = await uploadAvatar(profile.id, file);
      await updateProfile(profile.id, { avatar_url: url });
      await refresh();
      await refreshProfiles();
      showToast(t('settings.toast.photoUploaded'));
    } catch (ex) { showToast(t('common.error') + ': ' + ex.message, 'error'); }
    finally { setBusy(false); fileRef.current.value = ''; }
  };

  const removePhoto = async () => {
    if (!profile.avatar_url) return;
    setBusy(true);
    try {
      await removeAvatar(profile.avatar_url).catch(() => {});
      await updateProfile(profile.id, { avatar_url: null });
      await refresh();
      await refreshProfiles();
      showToast(t('settings.toast.photoRemoved'));
    } catch (ex) { showToast(t('common.error') + ': ' + ex.message, 'error'); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (!pass || pass.length < 8) { showToast(t('settings.minPassword'), 'error'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      setPass('');
      showToast(t('settings.toast.passwordChanged'));
    } catch (ex) { showToast(t('common.error') + ': ' + ex.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section ref={sectionRef} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 md:mb-10">
          <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">{t('settings.section')}</p>
          <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">{t('settings.title')}</h2>
          <p className="text-ink-500 font-medium mt-1">{t('settings.subtitle')}</p>
        </header>

        {/* PERFIL */}
        <div className="card-light p-7 mb-6" data-stagger>
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> {t('settings.profile')}
          </h3>

          <div className="flex items-start gap-6 mb-6">
            <div className="relative">
              <Avatar user={profile} size={96} />
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md hover:bg-violet-700 transition" disabled={busy}>
                <Camera className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.photo')}</label>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="btn-soft" disabled={busy}><Camera className="w-3.5 h-3.5" /> {t('settings.upload')}</button>
                {profile?.avatar_url && <button onClick={removePhoto} className="btn-danger" disabled={busy}><Trash2 className="w-3.5 h-3.5" /> {t('settings.removePhoto')}</button>}
              </div>
              <p className="text-[10px] text-ink-400 mt-2">{t('settings.photoHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.name')}</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-light" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.email')}</label>
              <input value={profile?.email || ''} disabled className="input-light opacity-60" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.role')}</label>
            <input value={profile?.role || ''} disabled className="input-light opacity-60 capitalize" />
          </div>

          <div className="mb-4">
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.avatarFallback')}</label>
            <div className="grid grid-cols-6 gap-2 max-w-md">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => setAvatar(n)} className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center font-bold text-xs hover:scale-110 transition shadow-md ${avatarClass(n)} ${avatar === n ? 'ring-4 ring-violet-500 scale-110' : ''}`}>{n}</button>
              ))}
            </div>
          </div>

          <button onClick={saveProfile} disabled={busy} className="btn-primary disabled:opacity-60">
            <Save className="w-3.5 h-3.5" /> {t('settings.save')}
          </button>
        </div>

        {/* PREFERENCIAS */}
        <div className="card-light p-7 mb-6" data-stagger>
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" /> {t('settings.preferences')}
          </h3>
          <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.language')}</label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => changeLang('es')} className={`cat-pill ${lang === 'es' ? 'active' : 'bg-ink-100 text-ink-600'}`}>🇪🇸 {t('settings.lang.es')}</button>
            <button onClick={() => changeLang('en')} className={`cat-pill ${lang === 'en' ? 'active' : 'bg-ink-100 text-ink-600'}`}>🇬🇧 {t('settings.lang.en')}</button>
            <button onClick={() => changeLang('pt')} className={`cat-pill ${lang === 'pt' ? 'active' : 'bg-ink-100 text-ink-600'}`}>🇧🇷 {t('settings.lang.pt')}</button>
          </div>
        </div>

        {/* LANDING */}
        <div className="card-light p-7 mb-6" data-stagger>
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Home className="w-3.5 h-3.5" /> {t('settings.landing.section')}
          </h3>
          <p className="text-[11px] text-ink-500 mb-3">{t('settings.landing.help')}</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { v: '/dashboard', l: t('nav.dashboard') },
              { v: '/projects', l: t('nav.projects') },
              { v: '/team', l: t('nav.team') },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={async () => { setLandingRoute(opt.v); await savePrefs({ landing_route: opt.v }); }}
                className={`cat-pill ${landingRoute === opt.v ? 'active' : 'bg-ink-100 text-ink-600'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* NOTIFICACIONES */}
        <div className="card-light p-7 mb-6" data-stagger>
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" /> {t('settings.notif.section')}
          </h3>

          {/* Canal preferido (mig-32). La campana in-app llega siempre; este
              selector decide email vs WhatsApp para avisos automáticos. */}
          <div className="mb-5">
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">Canal preferido</label>
            <p className="text-[11px] text-ink-500 mb-3">¿Por dónde quieres recibir avisos de proyectos, documentos y tareas?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'email', label: 'Email',          desc: 'A tu correo' },
                { v: 'none',  label: 'Solo en la app', desc: 'Solo la campana de la app' }
              ].map(opt => (
                <label
                  key={opt.v}
                  className={`cursor-pointer border-2 rounded-xl p-3 transition ${notifChannel === opt.v ? 'border-violet-500 bg-violet-50' : 'border-ink-100 hover:border-ink-200'}`}
                >
                  <input
                    type="radio"
                    name="notif_channel"
                    value={opt.v}
                    checked={notifChannel === opt.v}
                    onChange={async () => { setNotifChannel(opt.v); await savePrefs({ notif_channel: opt.v }); }}
                    className="sr-only"
                  />
                  <div className="text-[12px] font-black text-ink-800 mb-0.5">{opt.label}</div>
                  <div className="text-[10px] text-ink-500 leading-snug">{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifEmail}
                onChange={async (e) => { setNotifEmail(e.target.checked); await savePrefs({ notif_email_enabled: e.target.checked }); }}
                className="accent-violet-600 w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-ink-800">{t('settings.notif.email')}</div>
                <div className="text-[11px] text-ink-500">{t('settings.notif.emailHelp')}</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifInapp}
                onChange={async (e) => { setNotifInapp(e.target.checked); await savePrefs({ notif_inapp_enabled: e.target.checked }); }}
                className="accent-violet-600 w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-ink-800">{t('settings.notif.inapp')}</div>
                <div className="text-[11px] text-ink-500">{t('settings.notif.inappHelp')}</div>
              </div>
            </label>
          </div>
        </div>

        {/* SEGURIDAD */}
        <div className="card-light p-7" data-stagger>
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> {t('settings.security')}
          </h3>
          <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('settings.newPassword')}</label>
          <div className="flex gap-3">
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} className="input-light flex-1" placeholder="••••••••" />
            <button onClick={changePassword} disabled={busy || !pass} className="btn-primary disabled:opacity-60">{t('settings.changePassword')}</button>
          </div>
          <p className="text-[10px] text-ink-400 mt-2">{t('settings.minPassword')}</p>
        </div>
      </div>
    </section>
  );
}
