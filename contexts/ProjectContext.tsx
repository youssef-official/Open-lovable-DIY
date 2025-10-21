'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface Project {
  id: string;
  name: string;
  description: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  sandboxId?: string;
  generatedCode?: string;
  fileStructure?: string;
  chatHistory?: Array<{
    content: string;
    type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
    timestamp: Date;
  }>;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;
  loadProjects: () => void;
  saveProjects: () => void;
  clearAllProjects: () => void;
  getProjectById: (id: string) => Project | undefined;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProjects() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}

const PROJECTS_STORAGE_KEY = 'open-lovable-projects';
const CURRENT_PROJECT_KEY = 'open-lovable-current-project';

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load projects from localStorage on mount
  useEffect(() => {
    loadProjectsFromStorage();
  }, []);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      saveProjectsToStorage();
    }
  }, [projects, isLoaded]);

  const loadProjectsFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
      const currentProjectId = localStorage.getItem(CURRENT_PROJECT_KEY);

      if (stored) {
        const parsedProjects = JSON.parse(stored) as Project[];
        // Convert date strings back to Date objects
        const projectsWithDates = parsedProjects.map(p => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          chatHistory: p.chatHistory?.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        setProjects(projectsWithDates);

        // Restore current project if it exists
        if (currentProjectId) {
          const current = projectsWithDates.find(p => p.id === currentProjectId);
          if (current) {
            setCurrentProjectState(current);
          }
        }
      }

      setIsLoaded(true);
    } catch (error) {
      console.error('Failed to load projects from localStorage:', error);
      setIsLoaded(true);
    }
  }, []);

  const saveProjectsToStorage = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      if (currentProject) {
        localStorage.setItem(CURRENT_PROJECT_KEY, currentProject.id);
      } else {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
      }
    } catch (error) {
      console.error('Failed to save projects to localStorage:', error);
    }
  }, [projects, currentProject]);

  const addProject = useCallback((projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project => {
    const newProject: Project = {
      ...projectData,
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setProjects(prev => [newProject, ...prev]);
    setCurrentProjectState(newProject);
    return newProject;
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === id
          ? {
              ...p,
              ...updates,
              updatedAt: new Date(),
              id: p.id // Ensure ID doesn't change
            }
          : p
      )
    );

    // Update current project if it's the one being updated
    if (currentProject?.id === id) {
      setCurrentProjectState(prev =>
        prev
          ? {
              ...prev,
              ...updates,
              updatedAt: new Date(),
              id: prev.id
            }
          : null
      );
    }
  }, [currentProject]);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));

    // Clear current project if it's the one being deleted
    if (currentProject?.id === id) {
      setCurrentProjectState(null);
    }
  }, [currentProject]);

  const setCurrentProject = useCallback((id: string | null) => {
    if (id === null) {
      setCurrentProjectState(null);
    } else {
      const project = projects.find(p => p.id === id);
      if (project) {
        setCurrentProjectState(project);
      }
    }
  }, [projects]);

  const getProjectById = useCallback((id: string): Project | undefined => {
    return projects.find(p => p.id === id);
  }, [projects]);

  const value: ProjectContextType = {
    projects,
    currentProject,
    addProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    loadProjects: loadProjectsFromStorage,
    saveProjects: saveProjectsToStorage,
    clearAllProjects: () => {
      setProjects([]);
      setCurrentProjectState(null);
      localStorage.removeItem(PROJECTS_STORAGE_KEY);
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    },
    getProjectById
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

