import { create } from 'zustand';
import { fetchProjects, fetchProfiles, fetchCategories, fetchTeams } from './data';
import { logger } from './logger';

export const useStore = create((set) => ({
  projects: [],
  profiles: [],
  categories: [],
  teams: [],
  loading: false,

  refreshAll: async () => {
    set({ loading: true });
    const results = await Promise.allSettled([
      fetchProjects(), fetchProfiles(), fetchCategories(), fetchTeams()
    ]);
    const [projectsR, profilesR, categoriesR, teamsR] = results;
    const next = { loading: false };
    if (projectsR.status === 'fulfilled') next.projects = projectsR.value; else logger.error('refreshAll: projects', projectsR.reason);
    if (profilesR.status === 'fulfilled') next.profiles = profilesR.value; else logger.error('refreshAll: profiles', profilesR.reason);
    if (categoriesR.status === 'fulfilled') next.categories = categoriesR.value; else logger.error('refreshAll: categories', categoriesR.reason);
    if (teamsR.status === 'fulfilled') next.teams = teamsR.value; else logger.error('refreshAll: teams', teamsR.reason);
    set(next);
  },
  refreshProjects: async () => { try { set({ projects: await fetchProjects() }); } catch (e) { logger.error(e); } },
  refreshProfiles: async () => { try { set({ profiles: await fetchProfiles() }); } catch (e) { logger.error(e); } },
  refreshCategories: async () => { try { set({ categories: await fetchCategories() }); } catch (e) { logger.error(e); } },
  refreshTeams: async () => { try { set({ teams: await fetchTeams() }); } catch (e) { logger.error(e); } },

  patchProject: (id, patch) => set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p) })),
}));
