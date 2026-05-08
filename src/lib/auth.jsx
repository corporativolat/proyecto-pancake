/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthCtx = createContext(null);

const PERMS = {
  admin:   { viewAll: true,  createProject: true,  editAll: true,  deleteProject: true,  manageUsers: true,  manageCategories: true,  viewKPIs: true },
  gerente: { viewAll: true,  createProject: true,  editAll: true,  deleteProject: false, manageUsers: false, manageCategories: false, viewKPIs: true },
  miembro: { viewAll: false, createProject: false, editAll: false, deleteProject: false, manageUsers: false, manageCategories: false, viewKPIs: false }
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!session) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => { if (mounted) { setProfile(data); setLoading(false); } });
    return () => { mounted = false; };
  }, [session]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };
  const signUp = async (email, password, name) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  const can = (perm) => !!(profile && PERMS[profile.role]?.[perm]);

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signIn, signUp, signOut, can, refresh: () => session && supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({data}) => setProfile(data)) }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
