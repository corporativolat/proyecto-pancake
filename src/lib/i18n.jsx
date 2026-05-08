/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth.jsx';
import { updateProfile } from './data';
import { logger } from './logger';

const DICT = {
  es: {
    'nav.dashboard': 'Panel Gerencial',
    'nav.team': 'Mi Equipo',
    'nav.projects': 'Proyectos',
    'nav.admin': 'Administración',
    'nav.settings': 'Configuración',
    'nav.recents': 'Recientes',
    'nav.newProject': 'NUEVO PROYECTO',
    'nav.logout': 'Cerrar sesión',

    'login.title': 'PRO-GESTIÓN',
    'login.subtitle': 'Plataforma Estratégica Interna',
    'login.email': 'Correo',
    'login.password': 'Contraseña',
    'login.name': 'Nombre',
    'login.signin': 'INGRESAR',
    'login.signup': 'REGISTRARME',
    'login.processing': 'PROCESANDO…',
    'login.toSignup': '¿No tienes cuenta? Crear una',
    'login.toSignin': '¿Ya tienes cuenta? Ingresar',
    'login.note': 'Primer usuario que se registra → admin automático. Cuentas nuevas posteriores → rol miembro.',

    'dash.section': 'Vista Gerencial',
    'dash.title': 'Panel de Portafolio',
    'dash.subtitle': 'Indicadores estratégicos y salud global.',
    'dash.lastUpdate': 'Última actualización',
    'dash.kpi.initiatives': 'Iniciativas',
    'dash.kpi.active': 'Activos',
    'dash.kpi.finished': 'Finalizados',
    'dash.kpi.health': 'Salud Portafolio',
    'dash.categoryHealth': 'Salud por Categoría',
    'dash.avgProgress': '% promedio de avance',
    'dash.statusDist': 'Distribución por Estado',
    'dash.activeProjects': 'Proyectos Activos',
    'dash.search': 'Buscar...',
    'dash.topOwners': 'Top Líderes',
    'dash.col.project': 'Proyecto',
    'dash.col.category': 'Categoría',
    'dash.col.owner': 'Líder',
    'dash.col.status': 'Estado',
    'dash.col.progress': 'Avance',
    'dash.empty': 'Sin proyectos.',

    'team.section': 'Vista Productiva',
    'team.title': 'Mi Espacio',
    'team.subtitle': 'Mis proyectos, tareas y rendimiento.',
    'team.kpi.projects': 'Proyectos Activos',
    'team.kpi.tasks': 'Tareas Pendientes',
    'team.kpi.completion': 'Mi Cumplimiento',
    'team.myProjects': 'Mis Proyectos',
    'team.pending': 'Tareas Pendientes',
    'team.empty.projects': 'Sin proyectos asignados.',
    'team.empty.tasks': 'Sin tareas pendientes. ¡Buen trabajo!',
    'team.toast.completed': '✓ Tarea completada',
    'team.toast.reactivated': 'Tarea reactivada',

    'projects.section': 'Iniciativas',
    'projects.title': 'Proyectos',
    'projects.subtitle': 'Lista completa del portafolio.',
    'projects.all': 'Todas',
    'projects.new': 'NUEVO',
    'projects.empty': 'Sin proyectos en esta categoría.',
    'projects.noLeader': 'Sin líder',
    'projects.noGoal': 'Sin objetivo definido.',

    'pj.objective': 'Objetivo Estratégico',
    'pj.leader': 'Líder',
    'pj.status': 'Estado',
    'pj.summary': 'Resumen Ejecutivo',
    'pj.team': 'Equipo Asignado',
    'pj.progress': 'Avance',
    'pj.expand': 'Ampliar',
    'pj.report': 'Reporte',
    'pj.back': 'Volver',
    'pj.roadmap': 'Hoja de Ruta',
    'pj.phase': 'FASE',
    'pj.activity': 'Actividad',
    'pj.compliance': 'Cumplimiento',
    'pj.titlePlaceholder': 'Nombre del Proyecto',
    'pj.companyPlaceholder': 'Empresa o Cliente',
    'pj.goalPlaceholder': '¿Cuál es la meta final?',
    'pj.summaryPlaceholder': 'Resumen para reporte...',
    'pj.toast.saved': '✓ Actividad guardada',
    'pj.toast.deleted': 'Actividad eliminada',
    'pj.toast.created': '✓ Proyecto creado',
    'pj.toast.removed': 'Proyecto eliminado',
    'pj.confirm.delete': '¿Eliminar proyecto permanentemente?',
    'pj.confirm.deletePhase': '¿Eliminar fase?',
    'pj.confirm.deleteTask': '¿Eliminar actividad?',
    'pj.notFound': 'Proyecto no encontrado.',

    'admin.section': 'Configuración',
    'admin.title': 'Administración',
    'admin.subtitle': 'Usuarios, permisos y categorías.',
    'admin.users': 'Usuarios del Sistema',
    'admin.usersHint': 'Para crear: que la persona se registre desde el login',
    'admin.categories': 'Categorías de Proyecto',
    'admin.newCategory': 'NUEVA',
    'admin.edit': 'Editar',
    'admin.delete': 'Eliminar',
    'admin.userModal.title': 'Editar Usuario',

    'settings.section': 'Mi Cuenta',
    'settings.title': 'Configuración',
    'settings.subtitle': 'Edita tu perfil, preferencias y seguridad.',
    'settings.profile': 'Perfil',
    'settings.preferences': 'Preferencias',
    'settings.security': 'Seguridad',
    'settings.name': 'Nombre',
    'settings.email': 'Correo',
    'settings.role': 'Rol',
    'settings.photo': 'Foto de Perfil',
    'settings.upload': 'Subir foto',
    'settings.removePhoto': 'Quitar foto',
    'settings.avatarFallback': 'Avatar (si no hay foto)',
    'settings.language': 'Idioma',
    'settings.lang.es': 'Español',
    'settings.lang.en': 'English',
    'settings.password': 'Contraseña actual',
    'settings.newPassword': 'Nueva contraseña',
    'settings.changePassword': 'Cambiar contraseña',
    'settings.save': 'GUARDAR',
    'settings.toast.saved': '✓ Perfil actualizado',
    'settings.toast.passwordChanged': '✓ Contraseña actualizada',
    'settings.toast.photoUploaded': '✓ Foto actualizada',
    'settings.toast.photoRemoved': 'Foto eliminada',

    'common.cancel': 'Cancelar',
    'common.save': 'GUARDAR',
    'common.error': 'Error',
    'common.loading': 'CARGANDO…',
    'common.unassigned': 'Sin asignar',
    'common.search': 'Buscar...',
  },
  en: {
    'nav.dashboard': 'Executive Panel',
    'nav.team': 'My Team',
    'nav.projects': 'Projects',
    'nav.admin': 'Administration',
    'nav.settings': 'Settings',
    'nav.recents': 'Recent',
    'nav.newProject': 'NEW PROJECT',
    'nav.logout': 'Sign out',

    'login.title': 'PRO-GESTIÓN',
    'login.subtitle': 'Internal Strategic Platform',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.name': 'Name',
    'login.signin': 'SIGN IN',
    'login.signup': 'SIGN UP',
    'login.processing': 'PROCESSING…',
    'login.toSignup': "Don't have an account? Create one",
    'login.toSignin': 'Already have an account? Sign in',
    'login.note': 'First user to register → automatic admin. Subsequent accounts → member role.',

    'dash.section': 'Executive View',
    'dash.title': 'Portfolio Panel',
    'dash.subtitle': 'Strategic indicators and global health.',
    'dash.lastUpdate': 'Last update',
    'dash.kpi.initiatives': 'Initiatives',
    'dash.kpi.active': 'Active',
    'dash.kpi.finished': 'Finished',
    'dash.kpi.health': 'Portfolio Health',
    'dash.categoryHealth': 'Health by Category',
    'dash.avgProgress': '% avg progress',
    'dash.statusDist': 'Status Distribution',
    'dash.activeProjects': 'Active Projects',
    'dash.search': 'Search...',
    'dash.topOwners': 'Top Leaders',
    'dash.col.project': 'Project',
    'dash.col.category': 'Category',
    'dash.col.owner': 'Leader',
    'dash.col.status': 'Status',
    'dash.col.progress': 'Progress',
    'dash.empty': 'No projects.',

    'team.section': 'Productive View',
    'team.title': 'My Space',
    'team.subtitle': 'My projects, tasks and performance.',
    'team.kpi.projects': 'Active Projects',
    'team.kpi.tasks': 'Pending Tasks',
    'team.kpi.completion': 'My Completion',
    'team.myProjects': 'My Projects',
    'team.pending': 'Pending Tasks',
    'team.empty.projects': 'No projects assigned.',
    'team.empty.tasks': 'No pending tasks. Great job!',
    'team.toast.completed': '✓ Task completed',
    'team.toast.reactivated': 'Task reactivated',

    'projects.section': 'Initiatives',
    'projects.title': 'Projects',
    'projects.subtitle': 'Full portfolio list.',
    'projects.all': 'All',
    'projects.new': 'NEW',
    'projects.empty': 'No projects in this category.',
    'projects.noLeader': 'No leader',
    'projects.noGoal': 'No goal defined.',

    'pj.objective': 'Strategic Objective',
    'pj.leader': 'Leader',
    'pj.status': 'Status',
    'pj.summary': 'Executive Summary',
    'pj.team': 'Assigned Team',
    'pj.progress': 'Progress',
    'pj.expand': 'Expand',
    'pj.report': 'Report',
    'pj.back': 'Back',
    'pj.roadmap': 'Roadmap',
    'pj.phase': 'PHASE',
    'pj.activity': 'Activity',
    'pj.compliance': 'Compliance',
    'pj.titlePlaceholder': 'Project Name',
    'pj.companyPlaceholder': 'Company or Client',
    'pj.goalPlaceholder': 'What is the final goal?',
    'pj.summaryPlaceholder': 'Summary for report...',
    'pj.toast.saved': '✓ Activity saved',
    'pj.toast.deleted': 'Activity deleted',
    'pj.toast.created': '✓ Project created',
    'pj.toast.removed': 'Project deleted',
    'pj.confirm.delete': 'Permanently delete project?',
    'pj.confirm.deletePhase': 'Delete phase?',
    'pj.confirm.deleteTask': 'Delete activity?',
    'pj.notFound': 'Project not found.',

    'admin.section': 'Configuration',
    'admin.title': 'Administration',
    'admin.subtitle': 'Users, permissions and categories.',
    'admin.users': 'System Users',
    'admin.usersHint': 'To create: have person register from login',
    'admin.categories': 'Project Categories',
    'admin.newCategory': 'NEW',
    'admin.edit': 'Edit',
    'admin.delete': 'Delete',
    'admin.userModal.title': 'Edit User',

    'settings.section': 'My Account',
    'settings.title': 'Settings',
    'settings.subtitle': 'Edit your profile, preferences and security.',
    'settings.profile': 'Profile',
    'settings.preferences': 'Preferences',
    'settings.security': 'Security',
    'settings.name': 'Name',
    'settings.email': 'Email',
    'settings.role': 'Role',
    'settings.photo': 'Profile Photo',
    'settings.upload': 'Upload photo',
    'settings.removePhoto': 'Remove photo',
    'settings.avatarFallback': 'Avatar (if no photo)',
    'settings.language': 'Language',
    'settings.lang.es': 'Español',
    'settings.lang.en': 'English',
    'settings.password': 'Current password',
    'settings.newPassword': 'New password',
    'settings.changePassword': 'Change password',
    'settings.save': 'SAVE',
    'settings.toast.saved': '✓ Profile updated',
    'settings.toast.passwordChanged': '✓ Password updated',
    'settings.toast.photoUploaded': '✓ Photo uploaded',
    'settings.toast.photoRemoved': 'Photo removed',

    'common.cancel': 'Cancel',
    'common.save': 'SAVE',
    'common.error': 'Error',
    'common.loading': 'LOADING…',
    'common.unassigned': 'Unassigned',
    'common.search': 'Search...',
  }
};

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const { profile, refresh } = useAuth() || {};
  const [lang, setLang] = useState(() => localStorage.getItem('proLang') || 'es');

  useEffect(() => {
    if (profile?.language && profile.language !== lang) {
      setLang(profile.language);
      localStorage.setItem('proLang', profile.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.language]);

  const change = useCallback(async (next) => {
    setLang(next);
    localStorage.setItem('proLang', next);
    if (profile?.id) {
      try { await updateProfile(profile.id, { language: next }); refresh && refresh(); } catch (e) { logger.warn(e); }
    }
  }, [profile, refresh]);

  const t = useCallback((key, fallback) => {
    return DICT[lang]?.[key] ?? DICT.es?.[key] ?? fallback ?? key;
  }, [lang]);

  return <I18nCtx.Provider value={{ lang, t, change }}>{children}</I18nCtx.Provider>;
}

export const useT = () => {
  const ctx = useContext(I18nCtx);
  if (!ctx) return { t: (k) => k, lang: 'es', change: () => {} };
  return ctx;
};
