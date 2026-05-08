import { create } from 'zustand';
import { fetchProjects, fetchProfiles, fetchCategories } from './data';
import { logger } from './logger';

export const useStore = create((set) => ({
  projects: [],
  profiles: [],
  categories: [],
  loading: false,

  refreshAll: async () => {
    set({ loading: true });
    try {
      const [projects, profiles, categories] = await Promise.all([fetchProjects(), fetchProfiles(), fetchCategories()]);
      set({ projects, profiles, categories, loading: false });
    } catch (e) {
      logger.error('refreshAll', e);
      set({ loading: false });
    }
  },
  refreshProjects: async () => { try { set({ projects: await fetchProjects() }); } catch (e) { logger.error(e); } },
  refreshProfiles: async () => { try { set({ profiles: await fetchProfiles() }); } catch (e) { logger.error(e); } },
  refreshCategories: async () => { try { set({ categories: await fetchCategories() }); } catch (e) { logger.error(e); } },

  patchProject: (id, patch) => set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...patch } : p) })),
}));
