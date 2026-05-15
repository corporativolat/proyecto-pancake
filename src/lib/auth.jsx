/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from './supabase';
import { logger } from './logger';

const AuthCtx = createContext(null);

const PERMS = {
  super_admin: { viewAll: true,  createProject: true,  editAll: true,  deleteProject: true,  manageUsers: true,  manageCategories: true,  viewKPIs: true, manageClients: true, manageRoles: true, staff: true },
  admin:       { viewAll: true,  createProject: true,  editAll: true,  deleteProject: true,  manageUsers: true,  manageCategories: true,  viewKPIs: true, manageClients: true, manageRoles: false, staff: true },
  gerente:     { viewAll: true,  createProject: true,  editAll: true,  deleteProject: false, manageUsers: false, manageCategories: false, viewKPIs: true, manageClients: false, manageRoles: false, staff: true },
  miembro:     { viewAll: false, createProject: true,  editAll: false, deleteProject: false, manageUsers: false, manageCategories: false, viewKPIs: false, manageClients: false, manageRoles: false, staff: true },
  cliente:     { viewAll: false, createProject: false, editAll: false, deleteProject: false, manageUsers: false, manageCategories: false, viewKPIs: false, manageClients: false, manageRoles: false, staff: false, clientPortal: true }
};

export const CLIENT_ROLE = 'cliente';
export const STAFF_ROLES = ['super_admin', 'admin', 'gerente', 'miembro'];

export function isClientRole(role) { return role === CLIENT_ROLE; }
export function isStaffRole(role) { return STAFF_ROLES.includes(role); }

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
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) { logger.error('profile load', error); setProfile(null); }
        else setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        logger.error('profile load', err);
        setProfile(null);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [session]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);
  const signUp = useCallback(async (email, password, name) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
  }, []);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);
  const refresh = useCallback(() => (
    session && supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data))
      .catch((err) => logger.error('profile refresh', err))
  ), [session]);

  const can = useCallback((perm) => !!(profile && PERMS[profile.role]?.[perm]), [profile]);
  const isClient = !!profile && isClientRole(profile.role);
  const isStaff = !!profile && isStaffRole(profile.role);

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signUp, signOut, can, isClient, isStaff, refresh }),
    [session, profile, loading, signIn, signUp, signOut, can, isClient, isStaff, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
